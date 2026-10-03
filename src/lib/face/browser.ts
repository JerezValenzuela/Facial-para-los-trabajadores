/**
 * Reconocimiento facial en el NAVEGADOR con @vladmandic/face-api.
 * Solo se importa desde componentes cliente (carga diferida: nunca en el servidor).
 * Modelos servidos localmente desde /public/models (copiados en npm install).
 */
import type * as FaceApi from "@vladmandic/face-api";
import { frameMetrics, type Pt } from "./liveness";

type FaceApiModule = typeof FaceApi;

let loading: Promise<FaceApiModule> | null = null;

/** Carga la librería y los 3 modelos una sola vez (≈7 MB, quedan en caché del navegador). */
export function loadFaceApi(): Promise<FaceApiModule> {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      // El tipo exportado de tf es parcial; en tiempo de ejecución es TensorFlow.js completo.
      const tf = faceapi.tf as unknown as {
        setBackend(name: string): Promise<boolean>;
        ready(): Promise<void>;
      };
      const webgl = await tf.setBackend("webgl").catch(() => false);
      if (!webgl) await tf.setBackend("cpu");
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      return faceapi;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Mismas opciones en enrolamiento y en kiosco (los vectores deben ser comparables). */
export function detectorOptions(faceapi: FaceApiModule) {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
}

export type FaceSnapshot = {
  faces: number;
  score: number;
  box: { x: number; y: number; width: number; height: number };
  points: Pt[];
  metrics: { ear: number; yaw: number; size: number };
};

/** Detección rápida (sin descriptor) para el bucle de video. */
export async function detectFaces(
  faceapi: FaceApiModule,
  video: HTMLVideoElement,
): Promise<FaceSnapshot | null> {
  const results = await faceapi.detectAllFaces(video, detectorOptions(faceapi)).withFaceLandmarks();
  if (!results.length) return null;
  const main = results.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
  const points = main.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
  const box = main.detection.box;
  // Otra "cara" solo cuenta si es nítida y de tamaño real (evita falsos positivos
  // del detector en el fondo: carteles, reflejos, sombras).
  const significant = results.filter(
    (r) => r === main || (r.detection.score >= 0.7 && r.detection.box.width >= video.videoWidth * 0.1),
  ).length;
  return {
    faces: significant,
    score: main.detection.score,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    points,
    metrics: frameMetrics(points, box.width, video.videoWidth),
  };
}

/** Descriptor de 128 valores del rostro principal (o null si no hay exactamente uno). */
export async function computeDescriptor(
  faceapi: FaceApiModule,
  video: HTMLVideoElement,
): Promise<{ descriptor: number[]; score: number } | null> {
  const all = await faceapi
    .detectAllFaces(video, detectorOptions(faceapi))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (all.length !== 1) return null;
  return { descriptor: Array.from(all[0].descriptor), score: all[0].detection.score };
}

/** Miniatura JPEG pequeña del rostro (evidencia), recortada con margen. */
export function captureThumbnail(
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  size = 160,
  quality = 0.7,
): string | null {
  const margin = 0.35;
  const side = Math.max(box.width, box.height) * (1 + margin * 2);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = Math.max(0, cx - side / 2);
  const sy = Math.max(0, cy - side / 2);
  const sw = Math.min(video.videoWidth - sx, side);
  const sh = Math.min(video.videoHeight - sy, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Foto completa de la escena (cuadro entero, con el fondo), reducida para que
 * pese poco (~25–45 KB). Sirve para comprobar que la marcación fue en el local.
 */
export function captureScene(video: HTMLVideoElement, width = 480, quality = 0.7): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  // Si una cámara muy detallada supera el límite, se reduce la calidad.
  return dataUrl.length > 125_000 ? canvas.toDataURL("image/jpeg", 0.5) : dataUrl;
}

/** Abre la cámara frontal. Lanza un Error con mensaje en español si falla. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar la cámara. Usa Chrome, Edge o Firefox actualizados.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotAllowedError") throw new Error("Permiso de cámara denegado. Habilítalo en el candado de la barra de direcciones.");
    if (name === "NotFoundError") throw new Error("No se encontró ninguna cámara conectada.");
    if (name === "NotReadableError") throw new Error("La cámara está siendo usada por otra aplicación.");
    throw new Error("No se pudo abrir la cámara.");
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true }));
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
