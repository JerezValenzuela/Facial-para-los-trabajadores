"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  captureScene,
  captureThumbnail,
  computeDescriptor,
  detectFaces,
  loadFaceApi,
  openCamera,
  stopCamera,
  type FaceSnapshot,
} from "@/lib/face/browser";
import {
  LIVENESS,
  STEP_LABEL,
  stepProgress,
  type LivenessFrame,
  type LivenessStep,
} from "@/lib/face/liveness";
import { detectMobile, type DeviceSignals } from "@/lib/security/device";
import Link from "next/link";
import { KIOSK_ACTION_LABEL, type AttendanceEventType, type KioskOption } from "@/lib/attendance/events";
import { formatPermissionHours, permissionEnd, PERMISSION_HOUR_OPTIONS } from "@/lib/attendance/permissions";

// ---------------------------------------------------------------------------
// Tipos y constantes
// ---------------------------------------------------------------------------
type Phase =
  | { name: "boot"; note: string }
  | { name: "blocked"; title: string; message: string }
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "challenge"; steps: LivenessStep[]; stepIndex: number }
  | { name: "final"; total: number }
  | { name: "verifying" }
  | {
      name: "identified";
      ticket: string;
      firstName: string;
      options: KioskOption[];
      suggested: AttendanceEventType | null;
    }
  | { name: "marking"; firstName: string; label: string }
  | { name: "success"; firstName: string; title: string; time: string; info: string | null; warn: boolean }
  | {
      name: "permission";
      ticket: string;
      firstName: string;
      step: "kind" | "hours";
      hours: number | null;
      startTime: string;
      sending: boolean;
    }
  | { name: "notice"; tone: "error" | "info"; title: string; message: string };

type ChallengeState = {
  id: string;
  steps: LivenessStep[];
  frames: LivenessFrame[];
  t0: number;
  stepIndex: number;
  /** Orientación de la cámara detectada en el primer giro (−1 = imagen en espejo). */
  flip: 1 | -1 | 0;
  startDescriptor: number[];
  frontalCount: number;
  finishing: boolean;
};

const CHALLENGE_TIMEOUT_MS = 20_000;
/** Tiempo para elegir la marcación; si se acaba, hay que volver a escanear el rostro. */
const CHOICE_SECONDS = 15;
/** El panel de permiso necesita más tiempo (horas y hora de inicio); se reinicia con cada toque. */
const PERMISSION_TIMEOUT_MS = 60_000;
const SUCCESS_DISPLAY_MS = 6_000;
const NOTICE_DISPLAY_MS = 5_000;
const PRESENCE_FRAMES = 6;

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function api(path: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && data.ok === true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: "Sin conexión con el servidor. Revisa el internet del local." } };
  }
}

/** Reloj monotónico (solo se llama desde eventos y efectos, nunca al renderizar). */
function monotonicNow(): number {
  return performance.now();
}

function deviceSignals(): DeviceSignals {
  return {
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    screenWidth: Math.round(window.screen.width),
    screenHeight: Math.round(window.screen.height),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    canHover: window.matchMedia("(hover: hover)").matches,
  };
}

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.25 : 0.45));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.25 : 0.45));
    osc.onended = () => void ctx.close();
  } catch {
    // sin audio: no es crítico
  }
}

const clockFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const dateFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  weekday: "long",
  day: "numeric",
  month: "long",
});

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export function KioskClient({ branchCode }: { branchCode?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const faceapiRef = useRef<Awaited<ReturnType<typeof loadFaceApi>> | null>(null);
  const challengeRef = useRef<ChallengeState | null>(null);
  const presenceRef = useRef(0);
  const restUntilRef = useRef(0);
  const lastSeenRef = useRef(0);
  const deviceRef = useRef<DeviceSignals>({});

  const [phase, setPhase] = useState<Phase>({ name: "boot", note: "Iniciando…" });
  const [hint, setHint] = useState("Acércate a la cámara para marcar");
  const [branchName, setBranchName] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [clock, setClock] = useState<{ time: string; date: string }>({ time: "--:--:--", date: "" });
  const [offsetMs, setOffsetMs] = useState(0);

  // ---- Reloj sincronizado con la hora oficial del servidor ----
  useEffect(() => {
    let alive = true;
    fetch("/api/kiosk/time", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { now?: string }) => {
        if (alive && d.now) setOffsetMs(new Date(d.now).getTime() - Date.now());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date(Date.now() + offsetMs);
      setClock({ time: clockFmt.format(now), date: dateFmt.format(now) });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offsetMs]);

  // ---- Volver solo a la pantalla de espera ----
  useEffect(() => {
    let ms = 0;
    if (phase.name === "success") ms = SUCCESS_DISPLAY_MS;
    else if (phase.name === "notice") ms = NOTICE_DISPLAY_MS;
    else if (phase.name === "identified") ms = CHOICE_SECONDS * 1000;
    else if (phase.name === "permission" && !phase.sending) ms = PERMISSION_TIMEOUT_MS;
    else if (phase.name === "challenge" || phase.name === "final") ms = CHALLENGE_TIMEOUT_MS;
    if (!ms) return;
    const id = window.setTimeout(() => {
      if (phase.name === "challenge" || phase.name === "final") {
        const ch = challengeRef.current;
        challengeRef.current = null;
        // Se informa al servidor para que quede registrado el motivo (diagnóstico).
        if (ch) {
          void api("/api/kiosk/abort", {
            challengeId: ch.id,
            reason: phase.name === "final" ? "sin_mirar_al_centro" : "tiempo_agotado",
            stepIndex: ch.stepIndex,
            frames: ch.frames,
            device: deviceRef.current,
            branchCode,
          });
        }
        setPhase({
          name: "notice",
          tone: "error",
          title: "Tiempo agotado",
          message: "No se completó la verificación. Vuelve a intentarlo siguiendo las instrucciones.",
        });
        return;
      }
      if (phase.name === "identified" || phase.name === "permission") {
        // No eligió a tiempo: la identificación se descarta y se vuelve a escanear.
        setHint("Se acabó el tiempo para elegir. Mira a la cámara para escanearte de nuevo.");
      }
      restUntilRef.current = monotonicNow() + 3000;
      setPhase({ name: "idle" });
    }, ms);
    return () => window.clearTimeout(id);
  }, [phase, branchCode]);

  // ---- Lógica por cuadro de video ----
  async function startChallenge() {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return;
    setPhase({ name: "preparing" });
    const r = await api("/api/kiosk/challenge", { device: deviceRef.current, branchCode });
    if (!r.ok) return handleError(r);
    const start = await computeDescriptor(faceapi, video);
    if (!start) {
      setPhase({
        name: "notice",
        tone: "error",
        title: "Solo una persona",
        message: "Colócate solo tú frente a la cámara, de frente, y vuelve a intentarlo.",
      });
      return;
    }
    const steps = (r.data.steps as LivenessStep[]) ?? [];
    challengeRef.current = {
      id: String(r.data.challengeId),
      steps,
      frames: [],
      t0: monotonicNow(),
      stepIndex: 0,
      flip: 0,
      startDescriptor: start.descriptor,
      frontalCount: 0,
      finishing: false,
    };
    setHint("");
    setPhase({ name: "challenge", steps, stepIndex: 0 });
  }

  async function finishChallenge(snap: FaceSnapshot) {
    const ch = challengeRef.current;
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!ch || !faceapi || !video || ch.finishing) return;
    ch.finishing = true;
    const end = await computeDescriptor(faceapi, video);
    if (!end) {
      ch.finishing = false;
      ch.frontalCount = 0;
      return;
    }
    const thumbnail = captureThumbnail(video, snap.box);
    // Foto completa con el fondo: permite verificar que la marcación fue en el local.
    const scene = captureScene(video);
    setPhase({ name: "verifying" });
    const r = await api("/api/kiosk/identify", {
      challengeId: ch.id,
      frames: ch.frames,
      descriptors: [ch.startDescriptor, end.descriptor],
      thumbnail: thumbnail ?? undefined,
      scene: scene ?? undefined,
      device: deviceRef.current,
      branchCode,
    });
    challengeRef.current = null;
    if (!r.ok) return handleError(r);
    const d = r.data;
    const employee = (d.employee as { firstName: string }) ?? { firstName: "" };
    if (d.status === "identified") {
      setPhase({
        name: "identified",
        ticket: String(d.ticket),
        firstName: employee.firstName,
        options: (d.options as KioskOption[]) ?? [],
        suggested: (d.suggested as AttendanceEventType | null) ?? null,
      });
    } else if (d.status === "cooldown") {
      setPhase({
        name: "notice",
        tone: "info",
        title: `Hola, ${employee.firstName}`,
        message: `Acabas de marcar. Espera ${Number(d.waitSeconds) || 60} segundos antes de la siguiente marcación.`,
      });
    } else {
      setPhase({
        name: "notice",
        tone: "info",
        title: `Hola, ${employee.firstName}`,
        message: String(d.message ?? "Ya registraste todas tus marcaciones de hoy. ¡Buen descanso!"),
      });
    }
  }

  function handleError(r: ApiResult) {
    challengeRef.current = null;
    const code = String(r.data.code ?? "");
    const message = String(r.data.message ?? "Ocurrió un error. Intenta de nuevo.");
    beep(false);
    if (code === "ip_no_permitida") {
      setPhase({
        name: "blocked",
        title: "Equipo no autorizado",
        message: `${message} IP detectada: ${String(r.data.ip ?? "desconocida")}. El administrador debe registrarla en Sucursales e IPs.`,
      });
    } else if (code === "movil") {
      setPhase({ name: "blocked", title: "Dispositivo no permitido", message });
    } else {
      setPhase({ name: "notice", tone: "error", title: "No se pudo completar", message });
    }
  }

  async function confirmMark(eventType: AttendanceEventType) {
    if (phase.name !== "identified") return;
    const { ticket, firstName } = phase;
    const chosenLabel = KIOSK_ACTION_LABEL[eventType];
    setPhase({ name: "marking", firstName, label: chosenLabel });
    const r = await api("/api/kiosk/mark", { ticket, eventType, device: deviceRef.current, branchCode });
    if (!r.ok) return handleError(r);
    beep(true);
    setPhase({
      name: "success",
      firstName: String(r.data.firstName ?? firstName),
      title: `${String(r.data.eventLabel ?? chosenLabel)} ${eventType === "REGRESO_ALMUERZO" ? "registrado" : "registrada"}`,
      time: String(r.data.time ?? ""),
      info: (r.data.info as string | null) ?? null,
      warn: Boolean(r.data.warn),
    });
  }

  function startPermission() {
    if (phase.name !== "identified") return;
    setPhase({
      name: "permission",
      ticket: phase.ticket,
      firstName: phase.firstName,
      step: "kind",
      hours: null,
      startTime: clock.time.slice(0, 5),
      sending: false,
    });
  }

  async function submitPermission(kind: "dia_completo" | "horas") {
    if (phase.name !== "permission" || phase.sending) return;
    const { ticket, firstName, hours, startTime } = phase;
    if (kind === "horas" && (!hours || !/^\d{2}:\d{2}$/.test(startTime))) return;
    setPhase({ ...phase, sending: true });
    const r = await api("/api/kiosk/permission", {
      ticket,
      kind,
      ...(kind === "horas" ? { hours, startTime } : {}),
      device: deviceRef.current,
      branchCode,
    });
    if (!r.ok) return handleError(r);
    beep(true);
    setPhase({
      name: "success",
      firstName: String(r.data.firstName ?? firstName),
      title: "Permiso registrado",
      time: String(r.data.time ?? ""),
      info: String(r.data.detail ?? ""),
      warn: false,
    });
  }

  function cancelIdentified() {
    restUntilRef.current = monotonicNow() + 3000;
    setPhase({ name: "idle" });
  }

  const onFrame = useEffectEvent((snap: FaceSnapshot | null) => {
    const now = monotonicNow();
    if (snap && snap.faces >= 1) lastSeenRef.current = now;

    // Indicador de giro: tu izquierda se ve a la izquierda. Si la cámara entrega
    // la imagen en espejo (se detecta en el primer giro), se corrige el sentido.
    if (meterRef.current) {
      const chm = challengeRef.current;
      const base = chm?.frames[0]?.yaw ?? 0;
      const yaw = (snap?.metrics.yaw ?? base) - base;
      const sign = chm?.flip === -1 ? -1 : 1;
      const pos = Math.max(4, Math.min(96, 50 - yaw * 120 * sign));
      meterRef.current.style.left = `${pos}%`;
      meterRef.current.style.opacity = snap ? "1" : "0.25";
    }

    if (phase.name === "idle") {
      if (now < restUntilRef.current) return;
      if (!snap) {
        presenceRef.current = 0;
        setHint("Acércate a la cámara para marcar");
        return;
      }
      if (snap.faces > 1) {
        presenceRef.current = 0;
        setHint("Solo una persona a la vez frente a la cámara");
        return;
      }
      if (snap.metrics.size < 0.15) {
        presenceRef.current = 0;
        setHint("Acércate un poco más");
        return;
      }
      if (Math.abs(snap.metrics.yaw) > 0.12 || snap.score < 0.6) {
        presenceRef.current = 0;
        setHint("Mira de frente a la cámara");
        return;
      }
      presenceRef.current += 1;
      setHint("Quédate quieto un momento…");
      if (presenceRef.current >= PRESENCE_FRAMES) {
        presenceRef.current = 0;
        void startChallenge();
      }
      return;
    }

    if (phase.name === "identified" && now - lastSeenRef.current > 5000) {
      // El empleado se fue sin confirmar: no se deja la marcación abierta.
      cancelIdentified();
      return;
    }

    const ch = challengeRef.current;
    if (!ch || (phase.name !== "challenge" && phase.name !== "final")) return;
    if (!snap) return;
    if (snap.faces > 1) {
      challengeRef.current = null;
      setPhase({
        name: "notice",
        tone: "error",
        title: "Solo una persona",
        message: "Se detectó más de un rostro durante la verificación. Vuelve a intentarlo solo.",
      });
      return;
    }

    const t = Math.round(now - ch.t0);
    const last = ch.frames[ch.frames.length - 1];
    if (ch.frames.length < LIVENESS.maxFrames - 5 && (!last || t - last.t >= 30)) {
      ch.frames.push({
        t,
        ear: Number(snap.metrics.ear.toFixed(4)),
        yaw: Number(snap.metrics.yaw.toFixed(4)),
        size: Number(snap.metrics.size.toFixed(4)),
      });
    }

    if (phase.name === "challenge") {
      // Misma lógica que verifica el servidor (giros relativos: sirve con cámaras en espejo).
      const progress = stepProgress(ch.steps, ch.frames);
      ch.flip = progress.flip;
      if (progress.done >= ch.steps.length) {
        // El servidor hará la verificación completa de la traza.
        setPhase({ name: "final", total: ch.steps.length + 1 });
      } else if (progress.done !== ch.stepIndex) {
        ch.stepIndex = progress.done;
        setPhase({ name: "challenge", steps: ch.steps, stepIndex: ch.stepIndex });
      } else {
        const delta = Math.abs(snap.metrics.yaw - (ch.frames[0]?.yaw ?? 0));
        setHint(delta > LIVENESS.turnThreshold * 0.5 ? "Un poco más…" : "");
      }
      return;
    }

    // Fase final: mirar de frente para la captura final.
    const yawBase = ch.frames.length ? ch.frames[0].yaw : 0;
    if (Math.abs(snap.metrics.yaw - yawBase) < 0.1) {
      ch.frontalCount += 1;
      if (ch.frontalCount >= 3) void finishChallenge(snap);
    } else {
      ch.frontalCount = 0;
    }
  });

  // ---- Arranque: dispositivo → autorización del equipo → modelos → cámara ----
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let busy = false;
    let wakeLock: { release: () => Promise<void> } | null = null;

    (async () => {
      const signals = deviceSignals();
      deviceRef.current = signals;
      const verdict = detectMobile(navigator.userAgent, null, signals);
      if (verdict.mobile) {
        setPhase({
          name: "blocked",
          title: "Dispositivo no permitido",
          message: "La marcación solo está permitida desde las computadoras del local, no desde celulares ni tablets.",
        });
        return;
      }

      setPhase({ name: "boot", note: "Verificando este equipo…" });
      const status = await api("/api/kiosk/status", { device: signals, branchCode });
      if (cancelled) return;
      if (!status.ok) {
        const code = String(status.data.code ?? "");
        if (code === "ip_no_permitida" || code === "movil") return handleError(status);
        setPhase({
          name: "blocked",
          title: "Sin conexión con el servidor",
          message: `${String(status.data.message ?? "No se pudo verificar este equipo.")} Reintentando en 20 segundos…`,
        });
        window.setTimeout(() => window.location.reload(), 20_000);
        return;
      }
      setBranchName((status.data.branchName as string | null) ?? null);
      setDevMode(Boolean(status.data.devMode));

      try {
        setPhase({ name: "boot", note: "Cargando reconocimiento facial…" });
        const faceapi = await loadFaceApi();
        if (cancelled || !videoRef.current) return;
        faceapiRef.current = faceapi;
        setPhase({ name: "boot", note: "Abriendo la cámara…" });
        stream = await openCamera(videoRef.current);
        if (cancelled) return stopCamera(stream);
        try {
          const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release: () => Promise<void> }> } };
          wakeLock = (await nav.wakeLock?.request("screen")) ?? null;
        } catch {
          // la pantalla puede apagarse; no es crítico
        }
        setPhase({ name: "idle" });

        const loop = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!busy && video && video.readyState >= 2) {
            busy = true;
            try {
              onFrame(await detectFaces(faceapi, video));
            } catch {
              // cuadro perdido
            }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        setPhase({
          name: "blocked",
          title: "No se pudo iniciar",
          message: e instanceof Error ? e.message : "Error al iniciar la cámara.",
        });
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopCamera(stream);
      void wakeLock?.release().catch(() => undefined);
    };
    // Se ejecuta una sola vez al montar el kiosco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const showCamera = !["blocked"].includes(phase.name);
  const ringColor =
    phase.name === "challenge" || phase.name === "final"
      ? "ring-sky-400"
      : phase.name === "success"
        ? "ring-emerald-400"
        : phase.name === "notice" && phase.tone === "error"
          ? "ring-red-500"
          : "ring-white/15";

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-slate-950 text-white select-none">
      {/* Barra superior */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold">J</div>
          <div className="leading-tight">
            <p className="text-lg font-semibold">JerezCons</p>
            <p className="text-sm text-slate-400">
              {branchName ? `Sucursal ${branchName}` : "Control de asistencia"}
              {devMode && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">DEV_MODE</span>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">{clock.time}</p>
          <p className="text-sm text-slate-400 first-letter:uppercase">{clock.date}</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8">
        {phase.name === "blocked" ? (
          <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-5xl">⛔</p>
            <h1 className="mt-4 text-2xl font-semibold">{phase.title}</h1>
            <p className="mt-3 text-lg text-slate-300">{phase.message}</p>
          </div>
        ) : null}

        {/* Cámara */}
        <div
          className={`relative aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-3xl bg-slate-900 ring-4 transition-colors ${ringColor} ${
            showCamera ? "" : "hidden"
          }`}
        >
          <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" muted playsInline />
          {/* Guía ovalada */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[72%] w-[46%] rounded-[50%] border-4 border-dashed border-white/25" />
          </div>

          {/* Indicador de giro de cabeza */}
          {(phase.name === "challenge" || phase.name === "final") && (
            <div className="absolute inset-x-10 top-4 h-2 rounded-full bg-white/20">
              <div ref={meterRef} className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow" />
            </div>
          )}

          {/* Capas de estado sobre el video */}
          {phase.name === "boot" && <Overlay>{phase.note}</Overlay>}
          {(phase.name === "preparing" || phase.name === "verifying") && (
            <Overlay>
              <Spinner /> {phase.name === "preparing" ? "Preparando verificación…" : "Verificando identidad…"}
            </Overlay>
          )}
          {phase.name === "marking" && (
            <Overlay>
              <Spinner /> Registrando {phase.label.toLowerCase()}…
            </Overlay>
          )}
          {phase.name === "success" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-600/95 p-6 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-6xl text-emerald-600">✓</div>
              <p className="mt-5 text-3xl font-bold">{phase.title}</p>
              <p className="mt-2 font-mono text-5xl font-bold tabular-nums">{phase.time}</p>
              <p className="mt-3 text-xl">Gracias, {phase.firstName}</p>
              {phase.info && (
                <p className={`mt-4 rounded-xl px-4 py-2 text-lg font-semibold ${phase.warn ? "bg-amber-400 text-amber-950" : "bg-white/20"}`}>
                  {phase.info}
                </p>
              )}
            </div>
          )}
          {phase.name === "notice" && (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center ${
                phase.tone === "error" ? "bg-red-700/95" : "bg-sky-700/95"
              }`}
            >
              <p className="text-3xl font-bold">{phase.title}</p>
              <p className="mt-4 max-w-lg text-xl">{phase.message}</p>
            </div>
          )}
        </div>

        {/* Panel de instrucciones / acciones */}
        {phase.name === "idle" && <Instruction big>{hint}</Instruction>}

        {phase.name === "challenge" && (
          <div className="w-full max-w-2xl text-center">
            <p className="text-sm tracking-wide text-slate-400 uppercase">
              Prueba de vida · paso {Math.min(phase.stepIndex + 1, phase.steps.length + 1)} de {phase.steps.length + 1}
            </p>
            <p className="mt-2 text-4xl font-bold">
              <StepIcon step={phase.steps[phase.stepIndex]} /> {STEP_LABEL[phase.steps[phase.stepIndex]]}
            </p>
            <p className="mt-2 h-7 text-xl text-sky-300">{hint}</p>
            <StepDots total={phase.steps.length + 1} current={phase.stepIndex} />
          </div>
        )}

        {phase.name === "final" && (
          <div className="w-full max-w-2xl text-center">
            <p className="text-sm tracking-wide text-slate-400 uppercase">
              Prueba de vida · paso {phase.total} de {phase.total}
            </p>
            <p className="mt-2 text-4xl font-bold">🎯 Ahora mira al centro, de frente</p>
            <StepDots total={phase.total} current={phase.total - 1} />
          </div>
        )}

        {phase.name === "identified" && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-4">
            <p className="text-4xl font-bold">¡Hola, {phase.firstName}! 👋</p>
            <p className="text-2xl text-slate-300">¿Vas a…?</p>
            <ChoiceCountdown key={phase.ticket} seconds={CHOICE_SECONDS} />
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {phase.options.map((o) => (
                <OptionButton
                  key={o.event}
                  option={o}
                  suggested={o.event === phase.suggested}
                  onChoose={() => void confirmMark(o.event)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={startPermission}
              className="w-full rounded-2xl border-2 border-sky-400/60 bg-sky-500/15 px-6 py-5 text-left text-3xl font-bold text-sky-100 transition hover:bg-sky-500/25 active:scale-[0.99]"
            >
              📝 Permiso
              <span className="mt-1 block text-sm font-medium text-sky-200">Todo el día o por horas</span>
            </button>
            <button type="button" onClick={cancelIdentified} className="text-lg text-slate-400 underline-offset-4 hover:text-white hover:underline">
              No soy {phase.firstName} · cancelar
            </button>
          </div>
        )}

        {phase.name === "permission" && (
          <PermissionPanel
            phase={phase}
            onChange={(patch) => setPhase({ ...phase, ...patch })}
            onSubmit={(kind) => void submitPermission(kind)}
            onCancel={cancelIdentified}
          />
        )}
      </div>

      <footer className="flex flex-col items-center gap-3 px-6 pb-5 text-center">
        <Link
          href="/"
          className="rounded-xl border border-white/15 px-5 py-2.5 text-base font-medium text-slate-200 transition hover:bg-white/10"
        >
          ← Volver al inicio
        </Link>
        <p className="text-xs text-slate-500">
          La hora registrada es la hora oficial del servidor. Tus datos biométricos se tratan conforme a la LOPDP.
        </p>
      </footer>
    </main>
  );
}

/** Cuenta regresiva visible para elegir (el corte real lo hace el temporizador de fases). */
function ChoiceCountdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const start = monotonicNow();
    const id = window.setInterval(() => {
      setLeft(Math.max(0, seconds - Math.floor((monotonicNow() - start) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);
  const urgent = left <= 5;
  return (
    <div className="w-full max-w-md">
      <p className={`text-center text-lg font-semibold ${urgent ? "text-red-300" : "text-slate-300"}`}>
        ⏱️ Tienes {left} {left === 1 ? "segundo" : "segundos"} para elegir
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${urgent ? "bg-red-400" : "bg-brand-500"}`}
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-slate-950/70 text-xl font-medium">
      {children}
    </div>
  );
}

function Instruction({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return <p className={`text-center font-semibold ${big ? "text-3xl" : "text-xl"}`}>{children}</p>;
}

type PermissionPhase = Extract<Phase, { name: "permission" }>;

/** Pantalla de permiso: "Todo el día" o "Por horas" (cuántas y desde qué hora). */
function PermissionPanel({
  phase,
  onChange,
  onSubmit,
  onCancel,
}: {
  phase: PermissionPhase;
  onChange: (patch: Partial<PermissionPhase>) => void;
  onSubmit: (kind: "dia_completo" | "horas") => void;
  onCancel: () => void;
}) {
  const validTime = /^\d{2}:\d{2}$/.test(phase.startTime);
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <p className="text-4xl font-bold">📝 Permiso · {phase.firstName}</p>
      {phase.step === "kind" ? (
        <>
          <p className="text-2xl text-slate-300">¿De cuánto es tu permiso?</p>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={phase.sending}
              onClick={() => onSubmit("dia_completo")}
              className="rounded-2xl bg-brand-600 px-6 py-7 text-left text-3xl font-bold shadow-lg hover:bg-brand-500 disabled:opacity-60"
            >
              {phase.sending ? "Registrando…" : "Todo el día"}
              <span className="mt-1 block text-sm font-medium text-brand-100">No trabajas hoy</span>
            </button>
            <button
              type="button"
              disabled={phase.sending}
              onClick={() => onChange({ step: "hours" })}
              className="rounded-2xl bg-slate-700 px-6 py-7 text-left text-3xl font-bold shadow-lg hover:bg-slate-600"
            >
              Por horas
              <span className="mt-1 block text-sm font-medium text-slate-300">Eliges cuántas y desde qué hora</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-2xl text-slate-300">¿Cuántas horas?</p>
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-5">
            {PERMISSION_HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChange({ hours: h })}
                className={`rounded-xl px-3 py-4 text-xl font-bold transition ${
                  phase.hours === h ? "bg-brand-600 ring-4 ring-brand-300/60" : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {formatPermissionHours(h)}
              </button>
            ))}
          </div>
          <label className="mt-2 flex flex-wrap items-center justify-center gap-3 text-2xl text-slate-300">
            ¿A qué hora empieza?
            <input
              type="time"
              value={phase.startTime}
              onChange={(e) => onChange({ startTime: e.target.value })}
              className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 font-mono text-3xl text-white"
            />
          </label>
          {phase.hours && validTime && (
            <p className="text-lg text-sky-300">
              Permiso de {formatPermissionHours(phase.hours)}: de {phase.startTime} a {permissionEnd(phase.startTime, phase.hours)}
            </p>
          )}
          <button
            type="button"
            disabled={!phase.hours || !validTime || phase.sending}
            onClick={() => onSubmit("horas")}
            className="w-full rounded-2xl bg-brand-600 px-6 py-5 text-3xl font-bold shadow-lg hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase.sending ? "Registrando…" : "Registrar permiso"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => (phase.step === "hours" ? onChange({ step: "kind" }) : onCancel())}
        className="text-lg text-slate-400 underline-offset-4 hover:text-white hover:underline"
      >
        {phase.step === "hours" ? "← Atrás" : "Cancelar"}
      </button>
    </div>
  );
}

const timeOnly = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Botón grande de una opción: elegible, ya marcada (✓ hora) o ya no disponible. */
function OptionButton({
  option,
  suggested,
  onChoose,
}: {
  option: KioskOption;
  suggested: boolean;
  onChoose: () => void;
}) {
  if (option.status === "done") {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-5 text-left">
        <span className="text-2xl font-semibold text-emerald-200">{option.label}</span>
        <span className="text-lg text-emerald-300">✓ {option.at ? timeOnly.format(new Date(option.at)) : ""}</span>
      </div>
    );
  }
  if (option.status === "unavailable") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left text-2xl font-semibold text-slate-500">
        {option.label}
        <span className="mt-1 block text-sm font-normal">Ya no disponible hoy</span>
      </div>
    );
  }
  const tone = suggested
    ? "bg-brand-600 shadow-brand-900/40 ring-4 ring-brand-300/60 hover:bg-brand-500"
    : "bg-slate-700 hover:bg-slate-600";
  return (
    <button
      type="button"
      onClick={onChoose}
      autoFocus={suggested}
      className={`rounded-2xl px-6 py-6 text-left text-3xl font-bold shadow-lg transition focus-visible:outline-4 focus-visible:outline-brand-300 active:scale-[0.99] ${tone}`}
    >
      {option.label}
      {suggested && <span className="mt-1 block text-sm font-medium text-brand-100">Sugerido</span>}
    </button>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="mt-4 flex justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-16 rounded-full ${i < current ? "bg-emerald-400" : i === current ? "bg-sky-400" : "bg-white/20"}`}
        />
      ))}
    </div>
  );
}

function Spinner() {
  return <span className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-white/30 border-t-white" />;
}

function StepIcon({ step }: { step: LivenessStep | undefined }) {
  if (step === "turn_left") return <span aria-hidden>⬅️</span>;
  if (step === "turn_right") return <span aria-hidden>➡️</span>;
  return <span aria-hidden>👁️</span>;
}
