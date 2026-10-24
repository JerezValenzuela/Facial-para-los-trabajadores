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
import { ForgotExitWarning } from "./forgot-exit-warning";
import {
  IconAlertLine,
  IconArrowLeft,
  IconArrowRight,
  IconCameraLine,
  IconCheckLine,
  IconFileText,
  IconLock,
  IconTarget,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Tipos y constantes
// ---------------------------------------------------------------------------
type IdentifiedPhase = {
  name: "identified";
  ticket: string;
  firstName: string;
  options: KioskOption[];
  suggested: AttendanceEventType | null;
  /** Segundos para elegir (15, o 35 si antes salió el aviso de salida olvidada). */
  seconds: number;
};

type Phase =
  | { name: "boot"; note: string }
  | { name: "blocked"; title: string; message: string }
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "challenge"; steps: LivenessStep[]; stepIndex: number }
  | { name: "final"; total: number }
  | { name: "verifying" }
  | IdentifiedPhase
  /** Aviso rojo "olvidaste marcar tu salida" antes de mostrar las opciones. */
  | { name: "reminder"; dayLabel: string; next: IdentifiedPhase }
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
/** Duración del aviso "olvidaste marcar tu salida" (luego aparecen las opciones). */
const FORGOT_EXIT_REMINDER_SECONDS = 5;
/** Tiempo para elegir la marcación; si se acaba, hay que volver a escanear el rostro. */
const CHOICE_SECONDS = 15;
/** Segundos EXTRA para elegir cuando antes salió el aviso rojo (15 + 20 = 35). */
const FORGOT_EXIT_EXTRA_SECONDS = 20;
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
    else if (phase.name === "reminder") ms = FORGOT_EXIT_REMINDER_SECONDS * 1000;
    else if (phase.name === "identified") ms = phase.seconds * 1000;
    else if (phase.name === "permission" && !phase.sending) ms = PERMISSION_TIMEOUT_MS;
    else if (phase.name === "challenge" || phase.name === "final") ms = CHALLENGE_TIMEOUT_MS;
    if (!ms) return;
    const id = window.setTimeout(() => {
      if (phase.name === "reminder") {
        // Terminó el aviso: recién ahora empiezan los segundos para elegir. El tiempo
        // que no se vio la cara durante el aviso (se echan para atrás a leerlo) no
        // cuenta: si no, la regla de "se fue" cancelaba las opciones al instante.
        lastSeenRef.current = monotonicNow();
        setPhase(phase.next);
        return;
      }
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
      const identified: IdentifiedPhase = {
        name: "identified",
        ticket: String(d.ticket),
        firstName: employee.firstName,
        options: (d.options as KioskOption[]) ?? [],
        suggested: (d.suggested as AttendanceEventType | null) ?? null,
        seconds: CHOICE_SECONDS,
      };
      const forgot = d.forgotExit as { label?: string } | null | undefined;
      if (forgot?.label) {
        beep(false);
        setPhase({
          name: "reminder",
          dayLabel: forgot.label,
          next: { ...identified, seconds: CHOICE_SECONDS + FORGOT_EXIT_EXTRA_SECONDS },
        });
      } else {
        setPhase(identified);
      }
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
  // Render (solo interfaz: toda la lógica de cámara, prueba de vida y servidor está arriba)
  // ---------------------------------------------------------------------------
  const inChallenge = phase.name === "challenge" || phase.name === "final";
  // Después de reconocer la cara (opciones, permiso, aviso, registrando o éxito).
  const verified =
    phase.name === "identified" ||
    phase.name === "permission" ||
    phase.name === "reminder" ||
    phase.name === "marking" ||
    phase.name === "success";
  const frameBorder = inChallenge
    ? "border-4 border-[#1747a6]"
    : verified
      ? "border-4 border-[#1f9d55]"
      : phase.name === "notice" && phase.tone === "error"
        ? "border-4 border-[#ec3013]"
        : "border-2 border-[#201e1d]";
  // Zona a la que hay que mirar en la barra de la bolita (Izquierda / Centro / Derecha).
  const currentStep = phase.name === "challenge" ? phase.steps[phase.stepIndex] : undefined;
  const targetZone: "L" | "C" | "R" | null =
    phase.name === "final"
      ? "C"
      : phase.name === "challenge"
        ? currentStep === "turn_left"
          ? "L"
          : currentStep === "turn_right"
            ? "R"
            : "C"
        : null;

  return (
    <div className="grid h-dvh min-h-[460px] flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#f3f2f2] text-[#201e1d] select-none">
      {/* Cabecera */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#201e1d] px-[clamp(20px,3vw,40px)] py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 grid-cols-2" aria-hidden>
            <span className="bg-[#e8590c]" />
            <span className="bg-[#1747a6]" />
            <span className="bg-[#1747a6]" />
            <span className="bg-[#e8590c]" />
          </div>
          <div className="flex flex-col gap-px">
            <p className="text-xl leading-none font-extrabold tracking-[-0.02em]">
              <span className="text-[#e8590c]">Jerez</span>
              <span className="text-[#1747a6]">Cons</span>
            </p>
            <p className="text-[13px] font-medium text-[#55504d]">
              Control de asistencia{branchName ? ` · Sucursal ${branchName}` : ""}
              {devMode && (
                <span className="ml-2 bg-[#fde7da] px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-[#a83d05]">
                  DEV_MODE
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-baseline gap-3.5">
          <p className="text-sm font-medium text-[#55504d] first-letter:uppercase">{clock.date}</p>
          <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">{clock.time}</p>
        </div>
      </header>

      <main className="grid min-h-0 auto-rows-[minmax(max-content,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] overflow-x-hidden overflow-y-auto">
        {/* Columna izquierda: cámara (siempre montada; se oculta si el equipo está bloqueado) */}
        <section
          className={`relative z-[1] flex px-[clamp(20px,3vw,40px)] py-[clamp(12px,3vh,32px)] shadow-[2px_0_0_#201e1d,0_2px_0_#201e1d] ${
            phase.name === "blocked" ? "hidden" : ""
          }`}
        >
          <div className={`relative min-h-[240px] flex-1 overflow-hidden bg-[#4a4644] transition-colors ${frameBorder}`}>
            <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" muted playsInline />
            {/* Guía ovalada */}
            <div className="pointer-events-none absolute top-[46%] left-1/2 aspect-[3/4] w-[min(42%,300px)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-dashed border-white/85" />

            {/* Barra de la bolita que sigue la cabeza */}
            {inChallenge && (
              <div className="pointer-events-none absolute right-4 bottom-4 left-4 grid h-12 grid-cols-3 border-2 border-[#201e1d] bg-white">
                <ZoneCell label="Izquierda" active={targetZone === "L"} align="start" />
                <ZoneCell label="Centro" active={targetZone === "C"} align="center" />
                <ZoneCell label="Derecha" active={targetZone === "R"} align="end" />
                <div
                  ref={meterRef}
                  className="absolute top-1/2 left-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#1747a6] shadow-[0_0_0_2px_#1747a6]"
                />
              </div>
            )}

            {/* Capas de estado sobre el video */}
            {phase.name === "boot" && (
              <CameraOverlay icon={<IconCameraLine />}>{phase.note}</CameraOverlay>
            )}
            {(phase.name === "preparing" || phase.name === "verifying") && (
              <CameraOverlay icon={<Spinner />}>
                {phase.name === "preparing" ? "Preparando verificación…" : "Verificando identidad…"}
              </CameraOverlay>
            )}
            {phase.name === "marking" && (
              <CameraOverlay icon={<Spinner />}>Registrando {phase.label.toLowerCase()}…</CameraOverlay>
            )}
            {phase.name === "success" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1f9d55]/85">
                <div className="flex h-24 w-24 items-center justify-center border-2 border-[#201e1d] bg-white text-[#1f9d55] shadow-[6px_6px_0_#201e1d]">
                  <IconCheckLine className="h-14 w-14" strokeWidth={3} />
                </div>
              </div>
            )}
            {phase.name === "notice" && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  phase.tone === "error" ? "bg-[#ec3013]/80" : "bg-[#1747a6]/80"
                }`}
              >
                <div className="flex h-20 w-20 items-center justify-center border-2 border-[#201e1d] bg-white text-[#201e1d] shadow-[6px_6px_0_#201e1d]">
                  <IconAlertLine className="h-10 w-10" />
                </div>
              </div>
            )}
            {verified && phase.name !== "success" && phase.name !== "marking" && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-[#1f9d55] px-3.5 py-2.5 text-sm font-extrabold tracking-[0.08em] text-white uppercase">
                <IconCheckLine />
                Cara verificada
              </div>
            )}
          </div>
        </section>

        {/* Columna derecha: instrucciones o botones */}
        <section className="flex min-h-0 flex-col justify-center gap-[clamp(16px,3vh,28px)] overflow-y-auto px-[clamp(20px,3vw,48px)] py-[clamp(12px,3vh,48px)]">
          {phase.name === "blocked" && (
            <div className="mx-auto w-full max-w-xl border-2 border-[#201e1d] bg-white p-8 shadow-[6px_6px_0_#201e1d]">
              <div className="flex h-16 w-16 items-center justify-center border-2 border-[#201e1d] bg-[#ec3013] text-white">
                <IconAlertLine />
              </div>
              <h1 className="mt-5 text-[clamp(26px,3.4vw,40px)] leading-tight font-extrabold tracking-[-0.02em]">{phase.title}</h1>
              <p className="mt-3 text-lg leading-snug text-[#55504d]">{phase.message}</p>
            </div>
          )}

          {phase.name === "boot" && (
            <Lead
              label="Preparando"
              title="Colócate frente a la cámara"
              text="Pon la cara dentro del óvalo. En unos segundos empieza la prueba de vida."
            />
          )}

          {phase.name === "idle" && (
            <Lead
              label="Registro facial"
              title={hint}
              text="Pon la cara dentro del óvalo. En unos segundos empieza la prueba de vida."
            />
          )}

          {phase.name === "preparing" && <Lead label="Preparando" title="Preparando verificación…" />}

          {phase.name === "challenge" && (
            <StepPanel
              num={Math.min(phase.stepIndex + 1, phase.steps.length + 1)}
              total={phase.steps.length + 1}
              icon={currentStep === "turn_left" ? <IconArrowLeft className="h-11 w-11" /> : currentStep === "turn_right" ? <IconArrowRight className="h-11 w-11" strokeWidth={2.5} /> : <IconTarget />}
              title={currentStep ? STEP_LABEL[currentStep] : ""}
              hint={hint}
            />
          )}

          {phase.name === "final" && (
            <StepPanel num={phase.total} total={phase.total} icon={<IconTarget />} title="Ahora mira al centro, de frente" />
          )}

          {phase.name === "verifying" && <Lead label="Verificando" title="Verificando identidad…" />}

          {phase.name === "identified" && (
            <div className="flex flex-col gap-[clamp(8px,1.8vh,20px)]">
              <div className="flex flex-col gap-1">
                <h2 className="text-[clamp(28px,min(4vw,6vh),56px)] leading-none font-extrabold tracking-[-0.03em]">
                  ¡Hola, {phase.firstName}!
                </h2>
                <p className="text-[clamp(16px,2.4vh,20px)] font-medium">¿Qué vas a registrar?</p>
              </div>
              <ChoiceCountdown key={phase.ticket} seconds={phase.seconds} />
              <div className="grid grid-cols-2 gap-[clamp(8px,1.6vh,14px)] pr-2 pb-2">
                {phase.options.map((o) => (
                  <OptionButton
                    key={o.event}
                    option={o}
                    suggested={o.event === phase.suggested}
                    onChoose={() => void confirmMark(o.event)}
                  />
                ))}
                <button
                  type="button"
                  onClick={startPermission}
                  className={`col-span-full flex items-center justify-between gap-4 bg-[#1747a6] px-[18px] py-[clamp(8px,1.6vh,18px)] text-left text-white hover:bg-[#123a8a] active:bg-[#0e2e6e] ${PRESS} ${FOCUS}`}
                >
                  <span className="flex items-center gap-3.5">
                    <IconFileText />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[clamp(18px,3vh,22px)] font-extrabold">Permiso</span>
                      <span className="text-sm opacity-90">Todo el día o por horas</span>
                    </span>
                  </span>
                  <IconArrowRight className="h-6 w-6 shrink-0" />
                </button>
              </div>
              <button
                type="button"
                onClick={cancelIdentified}
                className={`self-start text-[15px] font-semibold text-[#55504d] underline underline-offset-[3px] hover:text-[#e8590c] ${FOCUS}`}
              >
                No soy {phase.firstName} · cancelar
              </button>
            </div>
          )}

          {phase.name === "marking" && <Lead label="Registrando" title={`Registrando ${phase.label.toLowerCase()}…`} />}

          {phase.name === "success" && (
            <div className="flex flex-col gap-[clamp(10px,2vh,18px)]">
              <p className="text-[13px] font-bold tracking-[0.12em] text-[#1f9d55] uppercase">Registro exitoso</p>
              <h2 className="text-[clamp(30px,min(4vw,6.5vh),56px)] leading-none font-extrabold tracking-[-0.03em]">{phase.title}</h2>
              <p className="text-[clamp(44px,min(6vw,10vh),88px)] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                {phase.time}
              </p>
              <p className="text-xl font-medium">Gracias, {phase.firstName}</p>
              {phase.info && (
                <p
                  className={`max-w-xl border-2 border-[#201e1d] px-4 py-3 text-lg font-bold shadow-[4px_4px_0_#201e1d] ${
                    phase.warn ? "bg-[#ec3013] text-white" : "bg-white text-[#201e1d]"
                  }`}
                >
                  {phase.info}
                </p>
              )}
            </div>
          )}

          {phase.name === "notice" && (
            <div
              className={`max-w-xl border-2 border-[#201e1d] p-[clamp(18px,3vh,32px)] text-white shadow-[6px_6px_0_#201e1d] ${
                phase.tone === "error" ? "bg-[#ec3013]" : "bg-[#1747a6]"
              }`}
            >
              <h2 className="text-[clamp(26px,min(3.4vw,5.5vh),44px)] leading-tight font-extrabold tracking-[-0.02em]">{phase.title}</h2>
              <p className="mt-3 text-[clamp(16px,2.4vh,20px)] leading-snug">{phase.message}</p>
            </div>
          )}

          {phase.name === "reminder" && (
            <ForgotExitWarning
              firstName={phase.next.firstName}
              dayLabel={phase.dayLabel}
              seconds={FORGOT_EXIT_REMINDER_SECONDS}
            />
          )}

          {phase.name === "permission" && (
            <PermissionPanel
              phase={phase}
              onChange={(patch) => setPhase({ ...phase, ...patch })}
              onSubmit={(kind) => void submitPermission(kind)}
              onCancel={cancelIdentified}
            />
          )}
        </section>
      </main>

      {/* Pie */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#201e1d] px-[clamp(20px,3vw,40px)] py-2.5">
        <Link
          href="/"
          className={`flex items-center gap-2 border-2 border-[#201e1d] bg-white px-3.5 py-2 text-[15px] font-bold text-[#201e1d] shadow-[4px_4px_0_#201e1d] transition-[background-color,translate,box-shadow] duration-100 hover:bg-[#fde7da] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#201e1d] ${FOCUS}`}
        >
          <IconArrowLeft />
          Volver al inicio
        </Link>
        <span className="max-w-[560px] text-[13px] text-[#55504d]">
          La hora registrada es la hora oficial del servidor. Tus datos biométricos se tratan conforme a la LOPDP.
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas de interfaz (sin lógica)
// ---------------------------------------------------------------------------
const FOCUS = "focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#201e1d] focus-visible:outline-solid";
/** Botón con borde negro y sombra sólida que se hunde al pulsar. */
const PRESS =
  "cursor-pointer border-2 border-[#201e1d] shadow-[6px_6px_0_#201e1d] transition-[background-color,translate,box-shadow] duration-100 " +
  "active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0_#201e1d] disabled:cursor-not-allowed disabled:opacity-50";

/** Una zona de la barra de la bolita; la zona a la que hay que mirar va en naranja claro. */
function ZoneCell({ label, active, align }: { label: string; active: boolean; align: "start" | "center" | "end" }) {
  const position =
    align === "start" ? "justify-start pl-3" : align === "end" ? "justify-end pr-3" : "justify-center border-x-2 border-[#201e1d]";
  return (
    <div
      className={`flex items-center text-xs font-bold tracking-[0.1em] uppercase ${position} ${active ? "bg-[#fde7da]" : "bg-white"}`}
    >
      {label}
    </div>
  );
}

function CameraOverlay({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-[#201e1d]/55 p-6 text-center text-white">
      {icon}
      <p className="text-xl font-bold">{children}</p>
    </div>
  );
}

/** Bloque de texto de la columna derecha: etiqueta azul, título grande y texto opcional. */
function Lead({ label, title, text }: { label: string; title: string; text?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] font-bold tracking-[0.12em] text-[#1747a6] uppercase">{label}</p>
      <h2 className="text-[clamp(30px,min(4vw,7vh),56px)] leading-none font-extrabold tracking-[-0.03em] text-balance">{title}</h2>
      {text && <p className="max-w-[420px] text-lg leading-[1.45] text-pretty">{text}</p>}
    </div>
  );
}

/** Paso de la prueba de vida: etiqueta, cuadro naranja con el ícono, instrucción y 3 barras. */
function StepPanel({
  num,
  total,
  icon,
  title,
  hint,
}: {
  num: number;
  total: number;
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-[clamp(16px,3vh,24px)]">
      <p className="text-[13px] font-bold tracking-[0.12em] text-[#1747a6] uppercase">
        Prueba de vida · Paso {num} de {total}
      </p>
      <div className="flex h-[clamp(64px,10vh,88px)] w-[clamp(64px,10vh,88px)] items-center justify-center border-2 border-[#201e1d] bg-[#e8590c] text-white shadow-[6px_6px_0_#201e1d]">
        {icon}
      </div>
      <h2 className="text-[clamp(34px,min(4vw,7vh),60px)] leading-none font-extrabold tracking-[-0.03em] text-balance">{title}</h2>
      <p className="min-h-7 text-xl font-bold text-[#1747a6]">{hint}</p>
      <div className="grid max-w-[420px] gap-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 ${i < num - 1 ? "bg-[#1747a6]" : i === num - 1 ? "bg-[#e8590c]" : "bg-[#dcd9d7]"}`}
          />
        ))}
      </div>
    </div>
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
    <div className="flex flex-col gap-2">
      <p className={`text-[15px] font-bold ${urgent ? "text-[#ec3013]" : "text-[#e8590c]"}`}>
        Tienes {left} {left === 1 ? "segundo" : "segundos"} para elegir
      </p>
      <div className="h-2.5 border-2 border-[#201e1d] bg-[#dcd9d7] box-content">
        <div
          className={`h-full transition-[width] duration-300 ease-linear ${urgent ? "bg-[#ec3013]" : "bg-[#e8590c]"}`}
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
    </div>
  );
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
    <div className="flex flex-col gap-[clamp(10px,2vh,20px)]">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center border-2 border-[#201e1d] bg-[#1747a6] text-white">
          <IconFileText />
        </span>
        <h2 className="text-[clamp(26px,min(3.6vw,6vh),48px)] leading-none font-extrabold tracking-[-0.03em]">
          Permiso · {phase.firstName}
        </h2>
      </div>
      {phase.step === "kind" ? (
        <>
          <p className="text-[clamp(16px,2.4vh,20px)] font-medium">¿De cuánto es tu permiso?</p>
          <div className="grid grid-cols-1 gap-[clamp(8px,1.6vh,14px)] pr-2 pb-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={phase.sending}
              onClick={() => onSubmit("dia_completo")}
              className={`flex flex-col items-start gap-1 bg-[#e8590c] px-[18px] py-[clamp(12px,2.4vh,24px)] text-left text-white hover:bg-[#d24f08] active:bg-[#a83d05] ${PRESS} ${FOCUS}`}
            >
              <span className="text-[clamp(20px,3.2vh,30px)] leading-[1.05] font-extrabold">
                {phase.sending ? "Registrando…" : "Todo el día"}
              </span>
              <span className="text-sm font-medium">No trabajas hoy</span>
            </button>
            <button
              type="button"
              disabled={phase.sending}
              onClick={() => onChange({ step: "hours" })}
              className={`flex flex-col items-start gap-1 bg-white px-[18px] py-[clamp(12px,2.4vh,24px)] text-left text-[#201e1d] hover:bg-[#fde7da] active:bg-[#f9cdb3] ${PRESS} ${FOCUS}`}
            >
              <span className="text-[clamp(20px,3.2vh,30px)] leading-[1.05] font-extrabold">Por horas</span>
              <span className="text-sm font-medium text-[#55504d]">Eliges cuántas y desde qué hora</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[clamp(16px,2.4vh,20px)] font-medium">¿Cuántas horas?</p>
          <div className="grid grid-cols-3 gap-2 pr-1 pb-1 sm:grid-cols-5">
            {PERMISSION_HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChange({ hours: h })}
                className={`border-2 border-[#201e1d] px-2 py-[clamp(6px,1.4vh,12px)] text-lg font-extrabold shadow-[3px_3px_0_#201e1d] transition-[background-color,translate,box-shadow] duration-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#201e1d] ${FOCUS} ${
                  phase.hours === h ? "bg-[#e8590c] text-white" : "bg-white text-[#201e1d] hover:bg-[#fde7da]"
                }`}
              >
                {formatPermissionHours(h)}
              </button>
            ))}
          </div>
          <label className="flex flex-wrap items-center gap-3 text-[clamp(16px,2.4vh,20px)] font-medium">
            ¿A qué hora empieza?
            <input
              type="time"
              value={phase.startTime}
              onChange={(e) => onChange({ startTime: e.target.value })}
              className={`border-2 border-[#201e1d] bg-white px-3 py-1.5 text-2xl font-bold tabular-nums ${FOCUS}`}
            />
          </label>
          {phase.hours && validTime && (
            <p className="text-lg font-bold text-[#1747a6]">
              Permiso de {formatPermissionHours(phase.hours)}: de {phase.startTime} a {permissionEnd(phase.startTime, phase.hours)}
            </p>
          )}
          <button
            type="button"
            disabled={!phase.hours || !validTime || phase.sending}
            onClick={() => onSubmit("horas")}
            className={`mr-2 mb-2 bg-[#e8590c] px-6 py-[clamp(10px,2vh,18px)] text-[clamp(20px,3vh,28px)] font-extrabold text-white hover:bg-[#d24f08] active:bg-[#a83d05] ${PRESS} ${FOCUS}`}
          >
            {phase.sending ? "Registrando…" : "Registrar permiso"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => (phase.step === "hours" ? onChange({ step: "kind" }) : onCancel())}
        className={`self-start text-[15px] font-semibold text-[#55504d] underline underline-offset-[3px] hover:text-[#e8590c] ${FOCUS}`}
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

/** Botón de una opción: elegible (sugerida en naranja), ya marcada (✓ hora) o ya no disponible. */
function OptionButton({
  option,
  suggested,
  onChoose,
}: {
  option: KioskOption;
  suggested: boolean;
  onChoose: () => void;
}) {
  const text = "text-[clamp(18px,3.2vh,30px)] leading-[1.05] font-extrabold";
  const pad = "px-[18px] py-[clamp(8px,2vh,22px)]";
  if (option.status === "done") {
    return (
      <div className={`flex flex-col items-start gap-1.5 border-2 border-[#201e1d] bg-[#e9e7e6] text-left ${pad}`}>
        <span className={`${text} text-[#55504d]`}>{option.label}</span>
        <span className="flex items-center gap-1 text-sm font-bold text-[#1f9d55]">
          <IconCheckLine className="h-4 w-4" /> {option.at ? timeOnly.format(new Date(option.at)) : ""}
        </span>
      </div>
    );
  }
  if (option.status === "locked") {
    // Bloqueado por el orden obligatorio (no se puede pulsar).
    return (
      <div
        aria-disabled="true"
        className={`flex flex-col items-start gap-1.5 border-2 border-[#9b9592] bg-[#dcd9d7] text-left text-[#7a7370] ${pad}`}
      >
        <span className={text}>{option.label}</span>
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <IconLock /> {option.note ?? "Bloqueado"}
        </span>
      </div>
    );
  }
  if (option.status === "unavailable") {
    return (
      <div className={`flex flex-col items-start gap-1.5 border-2 border-dashed border-[#9b9592] text-left text-[#9b9592] ${pad}`}>
        <span className={text}>{option.label}</span>
        <span className="text-sm font-medium">Ya no disponible hoy</span>
      </div>
    );
  }
  if (suggested) {
    return (
      <button
        type="button"
        onClick={onChoose}
        autoFocus
        className={`flex flex-col items-start gap-1.5 bg-[#e8590c] text-left text-white outline-none hover:bg-[#d24f08] active:bg-[#a83d05] ${pad} ${PRESS}`}
      >
        <span className={text}>{option.label}</span>
        <span className="bg-white px-2 py-0.5 text-xs font-extrabold tracking-[0.08em] text-[#201e1d] uppercase">Sugerido</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onChoose}
      className={`bg-white text-left text-[#201e1d] hover:bg-[#fde7da] active:bg-[#f9cdb3] ${text} ${pad} ${PRESS} ${FOCUS}`}
    >
      {option.label}
    </button>
  );
}

/** Indicador de carga cuadrado (sin esquinas redondeadas). */
function Spinner() {
  return <span className="inline-block h-9 w-9 animate-spin border-4 border-white/30 border-t-white" aria-hidden />;
}
