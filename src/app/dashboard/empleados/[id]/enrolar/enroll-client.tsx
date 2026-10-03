"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  captureThumbnail,
  computeDescriptor,
  detectFaces,
  loadFaceApi,
  openCamera,
  stopCamera,
  type FaceSnapshot,
} from "@/lib/face/browser";
import { euclidean } from "@/lib/face/liveness";
import { enrollFaceAction } from "./actions";
import { IconCheck } from "@/components/icons";

type Sample = { descriptor: number[]; score: number; yaw: number; size: number; preview: string | null };
type Metrics = FaceSnapshot["metrics"];

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;
const MIN_SCORE = 0.75;
const MIN_SIZE = 0.18;
/** Cada muestra nueva debe parecerse a la primera (misma persona). */
const SAME_PERSON = 0.55;

const PROMPTS: { text: string; ok: (m: Metrics, s: Sample[]) => boolean }[] = [
  { text: "Mira directo a la cámara", ok: (m) => Math.abs(m.yaw) < 0.08 },
  { text: "Gira la cabeza levemente hacia un lado", ok: (m) => Math.abs(m.yaw) >= 0.08 && Math.abs(m.yaw) <= 0.35 },
  {
    text: "Ahora gira levemente hacia el otro lado",
    ok: (m, s) =>
      Math.abs(m.yaw) >= 0.08 && Math.abs(m.yaw) <= 0.35 && Math.sign(m.yaw) !== Math.sign(s[1]?.yaw ?? 0),
  },
  {
    text: "Acércate un poco a la cámara, de frente",
    ok: (m, s) => Math.abs(m.yaw) < 0.12 && m.size >= Math.max(0.24, (s[0]?.size ?? 0) * 1.12),
  },
  { text: "Mira de frente otra vez, con expresión neutra", ok: (m) => Math.abs(m.yaw) < 0.08 },
];

type Status = "loading" | "ready" | "error" | "saving" | "done";

export function EnrollClient({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceapiRef = useRef<Awaited<ReturnType<typeof loadFaceApi>> | null>(null);
  const holdRef = useRef(0);
  const capturingRef = useRef(false);
  const lastCaptureRef = useRef(0);

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [hint, setHint] = useState("Cargando modelos de reconocimiento…");
  const [qualityOk, setQualityOk] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const promptIndex = Math.min(samples.length, PROMPTS.length - 1);
  const done = samples.length >= MAX_SAMPLES;

  async function capture(snap: FaceSnapshot) {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video || capturingRef.current) return;
    capturingRef.current = true;
    try {
      const r = await computeDescriptor(faceapi, video);
      if (!r) {
        setHint("No se pudo capturar: debe haber un solo rostro visible.");
        return;
      }
      if (samples.length > 0 && euclidean(r.descriptor, samples[0].descriptor) > SAME_PERSON) {
        setMessage({ ok: false, text: "Esa muestra no parece de la misma persona. Se descartó." });
        return;
      }
      const preview = captureThumbnail(video, snap.box, 96, 0.6);
      setSamples((prev) =>
        prev.length >= MAX_SAMPLES
          ? prev
          : [...prev, { descriptor: r.descriptor, score: r.score, yaw: snap.metrics.yaw, size: snap.metrics.size, preview }],
      );
      setMessage(null);
      lastCaptureRef.current = performance.now();
    } finally {
      holdRef.current = 0;
      capturingRef.current = false;
    }
  }

  function draw(snap: FaceSnapshot | null, ok: boolean) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!snap) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? "#10b981" : "#f59e0b";
    const { x, y, width, height } = snap.box;
    ctx.strokeRect(x, y, width, height);
  }

  const onSnapshot = useEffectEvent((snap: FaceSnapshot | null) => {
    let ok = false;
    if (!snap) setHint("No se detecta un rostro. Colócate frente a la cámara.");
    else if (snap.faces > 1) setHint("Hay más de un rostro en la imagen. Solo debe aparecer el empleado.");
    else if (snap.score < MIN_SCORE) setHint("Imagen poco clara: mejora la iluminación del rostro.");
    else if (snap.metrics.size < MIN_SIZE) setHint("Acércate un poco más a la cámara.");
    else {
      ok = true;
      setHint(samples.length >= MAX_SAMPLES ? "Muestras completas." : PROMPTS[promptIndex].text);
    }
    setQualityOk(ok);
    draw(snap, ok);

    if (!ok || !snap || samples.length >= MAX_SAMPLES || capturingRef.current) return;
    if (performance.now() - lastCaptureRef.current < 900) return;
    if (PROMPTS[promptIndex].ok(snap.metrics, samples)) {
      holdRef.current += 1;
      if (holdRef.current >= 3) void capture(snap);
    } else {
      holdRef.current = 0;
    }
  });

  async function onManualCapture() {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return;
    const snap = await detectFaces(faceapi, video);
    if (snap && snap.faces === 1 && snap.score >= MIN_SCORE && snap.metrics.size >= MIN_SIZE) await capture(snap);
    else setMessage({ ok: false, text: "No hay un rostro claro para capturar." });
  }

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let busy = false;

    (async () => {
      try {
        const faceapi = await loadFaceApi();
        if (cancelled || !videoRef.current) return;
        faceapiRef.current = faceapi;
        stream = await openCamera(videoRef.current);
        if (cancelled) return stopCamera(stream);
        setStatus("ready");
        const loop = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!busy && video && video.readyState >= 2) {
            busy = true;
            try {
              onSnapshot(await detectFaces(faceapi, video));
            } catch {
              // cuadro perdido: se ignora
            }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "No se pudo iniciar la cámara.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopCamera(stream);
    };
  }, []);

  async function save() {
    setStatus("saving");
    setMessage(null);
    const result = await enrollFaceAction({
      employeeId,
      descriptors: samples.map((s) => s.descriptor),
      scores: samples.map((s) => Math.round(s.score * 1000) / 1000),
    });
    if (result.ok) {
      setStatus("done");
      setMessage({ ok: true, text: result.message ?? "Enrolamiento guardado." });
    } else {
      setStatus("ready");
      setMessage({ ok: false, text: result.error });
    }
  }

  function reset() {
    setSamples([]);
    setMessage(null);
    holdRef.current = 0;
    if (status === "done") setStatus("ready");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="card overflow-hidden">
        <div className="relative aspect-[4/3] bg-slate-900">
          <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" muted playsInline />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">
              Cargando cámara y modelos…
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-200">
              {error}
            </div>
          )}
          {(status === "ready" || status === "saving") && (
            <div
              className={`absolute inset-x-0 bottom-0 px-4 py-3 text-center text-base font-medium text-white ${
                qualityOk ? "bg-emerald-600/85" : "bg-slate-900/75"
              }`}
              aria-live="polite"
            >
              {done ? "Muestras completas. Revisa y guarda." : hint}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Guía de captura</h2>
          <ol className="space-y-2">
            {PROMPTS.map((p, i) => {
              const captured = i < samples.length;
              const current = i === samples.length && !done;
              return (
                <li
                  key={p.text}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                    current ? "bg-brand-50 font-medium text-brand-800" : captured ? "text-slate-500" : "text-slate-700"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      captured ? "bg-emerald-500 text-white" : current ? "bg-brand-600 text-white" : "bg-slate-200"
                    }`}
                  >
                    {captured ? <IconCheck className="h-4 w-4" /> : i + 1}
                  </span>
                  {p.text}
                  {i >= MIN_SAMPLES && <span className="ml-auto text-xs text-slate-400">opcional</span>}
                </li>
              );
            })}
          </ol>
          {samples.length > 0 && (
            <div className="mt-3 flex gap-2" aria-label="Vista previa local (no se guarda)">
              {samples.map((s, i) =>
                s.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={s.preview} alt={`Muestra ${i + 1}`} className="h-12 w-12 -scale-x-100 rounded-md object-cover" />
                ) : null,
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Las vistas previas solo existen en este navegador; al guardar se envían únicamente los vectores.
          </p>
        </div>

        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
          >
            {message.text}
          </p>
        )}

        {status === "done" ? (
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/empleados/${employeeId}`} className="btn-primary">
              Volver a {employeeName.split(" ")[0]}
            </Link>
            <button type="button" className="btn-secondary" onClick={reset}>
              Enrolar de nuevo
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={samples.length < MIN_SAMPLES || status !== "ready"}
              onClick={save}
            >
              {status === "saving" ? "Guardando…" : `Guardar (${samples.length}/${MAX_SAMPLES})`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={status !== "ready" || done}
              onClick={() => void onManualCapture()}
            >
              Capturar ahora
            </button>
            <button type="button" className="btn-ghost" disabled={!samples.length || status === "saving"} onClick={reset}>
              Reiniciar
            </button>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Mínimo {MIN_SAMPLES} muestras; se recomiendan {MAX_SAMPLES}. Si el empleado usa lentes a diario, enrólalo con ellos.
        </p>
      </div>
    </div>
  );
}
