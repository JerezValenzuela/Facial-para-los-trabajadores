import { describe, expect, it } from "vitest";
import {
  eyeAspectRatio,
  euclidean,
  frameMetrics,
  maxPairwiseDistance,
  meanDescriptor,
  randomSteps,
  verifyLiveness,
  type LivenessFrame,
  type LivenessStep,
  type Pt,
} from "@/lib/face/liveness";

/** Traza sintética: arranca de frente y luego ejecuta cada paso. */
function trace(steps: LivenessStep[], opts: { still?: boolean; dt?: number } = {}): LivenessFrame[] {
  const frames: LivenessFrame[] = [];
  const dt = opts.dt ?? 50;
  let t = 0;
  let k = 0;
  const jitter = () => (((k++ * 7919) % 13) - 6) / 1000; // ruido determinista
  const push = (ear: number, yaw: number) => {
    frames.push({ t, ear: ear + jitter(), yaw: yaw + jitter(), size: 0.3 });
    t += dt;
  };
  for (let i = 0; i < 8; i++) push(0.3, 0);
  for (const s of steps) {
    if (opts.still) {
      for (let i = 0; i < 6; i++) frames.push({ t: (t += dt), ear: 0.3, yaw: 0, size: 0.3 });
      continue;
    }
    if (s === "blink") [0.3, 0.2, 0.12, 0.1, 0.18, 0.29, 0.3].forEach((e) => push(e, 0));
    if (s === "turn_left") [0.05, 0.15, 0.25, 0.3, 0.15, 0.02].forEach((y) => push(0.29, y));
    if (s === "turn_right") [-0.05, -0.15, -0.25, -0.3, -0.15, -0.02].forEach((y) => push(0.29, y));
  }
  for (let i = 0; i < 6; i++) push(0.3, 0);
  return frames;
}

describe("EAR y métricas por cuadro", () => {
  it("ojo abierto tiene EAR mayor que ojo cerrado", () => {
    const open: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }];
    const closed: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: -0.2 }, { x: 2, y: -0.2 }, { x: 3, y: 0 }, { x: 2, y: 0.2 }, { x: 1, y: 0.2 }];
    expect(eyeAspectRatio(open)).toBeCloseTo(2 / 3, 5);
    expect(eyeAspectRatio(closed)).toBeLessThan(eyeAspectRatio(open));
  });

  it("yaw positivo cuando la nariz se desplaza hacia la derecha de la imagen", () => {
    const pts: Pt[] = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    pts[36] = { x: 30, y: 40 };
    pts[45] = { x: 70, y: 40 };
    pts[30] = { x: 60, y: 60 };
    const m = frameMetrics(pts, 80, 640);
    expect(m.yaw).toBeCloseTo(0.25, 5);
    expect(m.size).toBeCloseTo(0.125, 5);
  });
});

describe("verificación de liveness (servidor)", () => {
  const cases: LivenessStep[][] = [["blink"], ["turn_left"], ["turn_right"], ["blink", "turn_left"], ["turn_right", "blink"], ["turn_left", "turn_right"]];
  it.each(cases)("acepta una traza real para %j", (...steps) => {
    expect(verifyLiveness(steps, trace(steps))).toEqual({ ok: true });
  });

  it("rechaza una imagen estática (foto)", () => {
    const r = verifyLiveness(["blink", "turn_left"], trace(["blink", "turn_left"], { still: true }));
    expect(r.ok).toBe(false);
  });

  it("rechaza girar hacia el lado contrario al pedido", () => {
    const r = verifyLiveness(["turn_left"], trace(["turn_right"]));
    expect(r).toEqual({ ok: false, reason: "paso_no_cumplido:turn_left" });
  });

  it("exige el ORDEN de los pasos", () => {
    const r = verifyLiveness(["blink", "turn_left"], trace(["turn_left", "blink"]));
    expect(r.ok).toBe(false);
  });

  it("rechaza trazas con tiempos imposibles o valores fuera de rango", () => {
    expect(verifyLiveness(["blink"], trace(["blink"], { dt: 5 }))).toMatchObject({ ok: false, reason: "tiempos_invalidos" });
    const bad = trace(["blink"]);
    bad[3] = { ...bad[3], ear: 5 };
    expect(verifyLiveness(["blink"], bad)).toMatchObject({ ok: false, reason: "valores_invalidos" });
    expect(verifyLiveness(["blink"], trace(["blink"]).slice(0, 4))).toMatchObject({ ok: false, reason: "pocos_cuadros" });
  });

  it("rechaza un salto brusco de tamaño de rostro (cambio de imagen)", () => {
    const t = trace(["blink"]);
    t[10] = { ...t[10], size: 0.6 };
    expect(verifyLiveness(["blink"], t)).toMatchObject({ ok: false, reason: "salto_de_rostro" });
  });

  it("los retos aleatorios no repiten pasos", () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSteps(3);
      expect(new Set(s).size).toBe(3);
    }
    expect(randomSteps(2)).toHaveLength(2);
  });
});

describe("descriptores", () => {
  it("distancia euclidiana, promedio y dispersión", () => {
    expect(euclidean([0, 0], [3, 4])).toBe(5);
    expect(meanDescriptor([[0, 2], [2, 4]])).toEqual([1, 3]);
    expect(maxPairwiseDistance([[0, 0], [3, 4], [0, 1]])).toBe(5);
  });
});
