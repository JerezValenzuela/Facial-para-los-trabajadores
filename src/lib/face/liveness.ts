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
  /** Giro mínimo (en distancias inter-oculares) respecto a la postura inicial (≈ 12–15°). */
  turnThreshold: 0.14,
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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Normaliza un cuadro a rangos físicos. Con la cabeza muy girada los puntos de
 * los ojos se comprimen y el EAR/yaw pueden dispararse: se RECORTAN (no se
 * descarta el intento). Devuelve null solo si hay valores no numéricos.
 */
export function sanitizeFrame(f: LivenessFrame): LivenessFrame | null {
  if (![f.t, f.ear, f.yaw, f.size].every(Number.isFinite)) return null;
  return { t: f.t, ear: clamp(f.ear, 0, 1), yaw: clamp(f.yaw, -1.5, 1.5), size: clamp(f.size, 0, 1) };
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
    ear: clamp((left + right) / 2, 0, 1),
    yaw: clamp((nose.x - midX) / interOcular, -1.5, 1.5),
    size: imageWidth > 0 ? clamp(boxWidth / imageWidth, 0, 1) : 0,
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

const TURN_SIGN: Record<"turn_left" | "turn_right", 1 | -1> = { turn_left: 1, turn_right: -1 };

/**
 * Cuántos pasos del reto se cumplieron, en orden.
 * Los giros se evalúan de forma RELATIVA: el primer giro fija la orientación de
 * la cámara y los siguientes deben alternar como se pidió. Así funciona igual
 * con cámaras que entregan la imagen en espejo (muy común en webcams de PC),
 * y sigue exigiendo girar a un lado y luego al otro.
 */
export function stepProgress(
  steps: LivenessStep[],
  frames: LivenessFrame[],
): { done: number; flip: 1 | -1 | 0 } {
  const yawBase = median(frames.slice(0, Math.min(5, frames.length)).map((f) => f.yaw));
  let idx = 0;
  let flip: 1 | -1 | 0 = 0;
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    if (step === "blink") {
      const at = findStep("blink", frames, idx);
      if (at < 0) return { done: s, flip };
      idx = at + 1;
      continue;
    }
    const want = TURN_SIGN[step];
    let found = -1;
    for (let i = idx; i < frames.length; i++) {
      const delta = frames[i].yaw - yawBase;
      if (Math.abs(delta) <= LIVENESS.turnThreshold) continue;
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      if (flip === 0) {
        flip = dir === want ? 1 : -1;
        found = i;
        break;
      }
      if (dir === want * flip) {
        found = i;
        break;
      }
    }
    if (found < 0) return { done: s, flip };
    idx = found + 1;
  }
  return { done: steps.length, flip };
}

/** Resumen numérico de una traza (para diagnosticar intentos fallidos). */
export function traceStats(frames: LivenessFrame[]) {
  if (!frames.length) return { cuadros: 0 };
  const yawBase = median(frames.slice(0, Math.min(5, frames.length)).map((f) => f.yaw));
  const deltas = frames.map((f) => f.yaw - yawBase);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    cuadros: frames.length,
    duracion_ms: Math.round(frames[frames.length - 1].t - frames[0].t),
    giro_min: r(Math.min(...deltas)),
    giro_max: r(Math.max(...deltas)),
    umbral_giro: LIVENESS.turnThreshold,
  };
}

export type LivenessResult = { ok: true } | { ok: false; reason: string };

/** Verificación completa de la traza (la que ejecuta el SERVIDOR). */
export function verifyLiveness(steps: LivenessStep[], rawFrames: LivenessFrame[]): LivenessResult {
  if (!steps.length) return { ok: false, reason: "sin_pasos" };
  if (rawFrames.length < LIVENESS.minFrames) return { ok: false, reason: "pocos_cuadros" };
  if (rawFrames.length > LIVENESS.maxFrames) return { ok: false, reason: "demasiados_cuadros" };

  const frames: LivenessFrame[] = [];
  for (let i = 0; i < rawFrames.length; i++) {
    const f = sanitizeFrame(rawFrames[i]);
    if (!f) return { ok: false, reason: "valores_invalidos" };
    if (i > 0 && f.t - frames[i - 1].t < LIVENESS.minFrameIntervalMs) {
      return { ok: false, reason: "tiempos_invalidos" };
    }
    frames.push(f);
  }
  const duration = frames[frames.length - 1].t - frames[0].t;
  if (duration < LIVENESS.minDurationMs || duration > LIVENESS.maxDurationMs) {
    return { ok: false, reason: "duracion_invalida" };
  }

  // Una imagen estática casi no varía; un rostro real sí (ojos y giro de cabeza).
  const std = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  };
  if (std(frames.map((f) => f.ear)) < 0.004 && std(frames.map((f) => f.yaw)) < 0.02) {
    return { ok: false, reason: "sin_variacion" };
  }

  // La cara no debe "saltar" de tamaño (cambio de imagen frente a la cámara).
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].size;
    const b = frames[i].size;
    if (a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > 2) return { ok: false, reason: "salto_de_rostro" };
  }

  const { done } = stepProgress(steps, frames);
  if (done < steps.length) return { ok: false, reason: `paso_no_cumplido:${steps[done]}` };
  return { ok: true };
}

/**
 * Reto del kiosco (orden fijo pedido por JerezCons): girar la cabeza a la
 * DERECHA, luego a la IZQUIERDA y al final mirar al CENTRO (captura final).
 * Sin parpadeo. El servidor igual verifica este orden en la traza.
 */
export function kioskSteps(): LivenessStep[] {
  return ["turn_right", "turn_left"];
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
