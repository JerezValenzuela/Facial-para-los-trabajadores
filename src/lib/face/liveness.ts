/**
 * Liveness (prueba de vida) basado en los 68 puntos faciales.
 * Funciones PURAS: el navegador las usa para guiar al empleado y el servidor
 * las vuelve a ejecutar sobre la traza recibida (nunca confía en el "ok" del cliente).
 *
 * Métricas por cuadro:
 *  - EAR (eye aspect ratio): apertura de los ojos. Abiertos ≈ 0.25–0.35; cerrados < 0.2.
 *  - yaw: desplazamiento horizontal de la punta de la nariz respecto al centro de
 *    los ojos, normalizado por la distancia entre ojos. 0 = de frente.
 *    En la imagen SIN espejo, girar hacia la IZQUIERDA del empleado da yaw > 0.
 *
 * Límite conocido: una cámara web 2D no distingue con certeza un video
 * reproducido en otra pantalla. Los retos aleatorios en secuencia, la IP del
 * local, la miniatura de evidencia y la auditoría elevan el costo del fraude.
 */

export type LivenessStep = "blink" | "turn_left" | "turn_right";
export const LIVENESS_STEPS: readonly LivenessStep[] = ["blink", "turn_left", "turn_right"];

export const STEP_LABEL: Record<LivenessStep, string> = {
  blink: "Parpadea despacio",
  turn_left: "Gira la cabeza hacia tu izquierda",
  turn_right: "Gira la cabeza hacia tu derecha",
};

export type Pt = { x: number; y: number };
export type LivenessFrame = { t: number; ear: number; yaw: number; size: number };

export const LIVENESS = {
  /** Cierre: EAR por debajo de este factor del EAR habitual (mediana). */
  blinkCloseFactor: 0.75,
  /** Reapertura: EAR vuelve por encima de este factor. */
  blinkOpenFactor: 0.9,
  /** Giro mínimo (en distancias inter-oculares) respecto a la postura inicial. */
  turnThreshold: 0.16,
  /** Postura "de frente": |yaw| menor que esto. */
  frontalMaxYaw: 0.1,
  minFrames: 8,
  maxFrames: 600,
  minDurationMs: 500,
  maxDurationMs: 25_000,
  minFrameIntervalMs: 15,
} as const;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** EAR de un ojo (6 puntos p1..p6 en el orden del modelo de 68 puntos). */
export function eyeAspectRatio(eye: Pt[]): number {
  if (eye.length !== 6) return 0;
  const horizontal = dist(eye[0], eye[3]);
  if (horizontal === 0) return 0;
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * horizontal);
}

/** Métricas de un cuadro a partir de los 68 puntos y el ancho de la imagen. */
export function frameMetrics(points: Pt[], boxWidth: number, imageWidth: number): Omit<LivenessFrame, "t"> {
  if (points.length !== 68) return { ear: 0, yaw: 0, size: 0 };
  const left = eyeAspectRatio(points.slice(36, 42));
  const right = eyeAspectRatio(points.slice(42, 48));
  const outerA = points[36];
  const outerB = points[45];
  const interOcular = dist(outerA, outerB) || 1;
  const midX = (outerA.x + outerB.x) / 2;
  const nose = points[30];
  return {
    ear: (left + right) / 2,
    yaw: (nose.x - midX) / interOcular,
    size: imageWidth > 0 ? boxWidth / imageWidth : 0,
  };
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Índice del cuadro donde se cumple el paso (buscando desde `from`), o -1. */
export function findStep(step: LivenessStep, frames: LivenessFrame[], from: number): number {
  if (step === "blink") {
    const baseline = median(frames.map((f) => f.ear));
    if (baseline <= 0) return -1;
    const closeThr = baseline * LIVENESS.blinkCloseFactor;
    const openThr = baseline * LIVENESS.blinkOpenFactor;
    let closedAt = -1;
    for (let i = from; i < frames.length; i++) {
      if (closedAt < 0) {
        if (frames[i].ear < closeThr) closedAt = i;
      } else if (frames[i].ear > openThr) {
        return i;
      }
    }
    return -1;
  }
  const yawBase = median(frames.slice(0, Math.min(5, frames.length)).map((f) => f.yaw));
  for (let i = from; i < frames.length; i++) {
    const delta = frames[i].yaw - yawBase;
    if (step === "turn_left" && delta > LIVENESS.turnThreshold) return i;
    if (step === "turn_right" && delta < -LIVENESS.turnThreshold) return i;
  }
  return -1;
}

export type LivenessResult = { ok: true } | { ok: false; reason: string };

/** Verificación completa de la traza (la que ejecuta el SERVIDOR). */
export function verifyLiveness(steps: LivenessStep[], frames: LivenessFrame[]): LivenessResult {
  if (!steps.length) return { ok: false, reason: "sin_pasos" };
  if (frames.length < LIVENESS.minFrames) return { ok: false, reason: "pocos_cuadros" };
  if (frames.length > LIVENESS.maxFrames) return { ok: false, reason: "demasiados_cuadros" };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const finite = [f.t, f.ear, f.yaw, f.size].every(Number.isFinite);
    if (!finite || f.ear < 0 || f.ear > 1 || Math.abs(f.yaw) > 2 || f.size < 0 || f.size > 1) {
      return { ok: false, reason: "valores_invalidos" };
    }
    if (i > 0 && f.t - frames[i - 1].t < LIVENESS.minFrameIntervalMs) {
      return { ok: false, reason: "tiempos_invalidos" };
    }
  }
  const duration = frames[frames.length - 1].t - frames[0].t;
  if (duration < LIVENESS.minDurationMs || duration > LIVENESS.maxDurationMs) {
    return { ok: false, reason: "duracion_invalida" };
  }

  // Una imagen estática casi no varía; un rostro real sí (micro-movimientos).
  const ears = frames.map((f) => f.ear);
  const mean = ears.reduce((a, b) => a + b, 0) / ears.length;
  const variance = ears.reduce((a, b) => a + (b - mean) ** 2, 0) / ears.length;
  if (Math.sqrt(variance) < 0.004) return { ok: false, reason: "sin_variacion" };

  // La cara no debe "saltar" de tamaño (cambio de imagen frente a la cámara).
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].size;
    const b = frames[i].size;
    if (a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > 1.6) return { ok: false, reason: "salto_de_rostro" };
  }

  let idx = 0;
  for (const step of steps) {
    const at = findStep(step, frames, idx);
    if (at < 0) return { ok: false, reason: `paso_no_cumplido:${step}` };
    idx = at + 1;
  }
  return { ok: true };
}

/** Elige `count` pasos aleatorios sin repetir consecutivos (lo decide el SERVIDOR). */
export function randomSteps(count: number, rand: () => number = Math.random): LivenessStep[] {
  const out: LivenessStep[] = [];
  const pool = [...LIVENESS_STEPS];
  for (let i = 0; i < count; i++) {
    const options = pool.filter((s) => s !== out[out.length - 1] && !out.includes(s));
    const choices = options.length ? options : pool;
    out.push(choices[Math.floor(rand() * choices.length)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Descriptores
// ---------------------------------------------------------------------------
export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function meanDescriptor(list: ArrayLike<number>[]): number[] {
  const n = list.length;
  const out = new Array<number>(list[0].length).fill(0);
  for (const d of list) for (let i = 0; i < out.length; i++) out[i] += d[i] / n;
  return out;
}

/** Distancia máxima entre descriptores del MISMO intento (misma persona todo el tiempo). */
export const SAME_PERSON_MAX_DISTANCE = 0.45;

export function maxPairwiseDistance(list: ArrayLike<number>[]): number {
  let max = 0;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) max = Math.max(max, euclidean(list[i], list[j]));
  return max;
}
