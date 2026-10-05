import { describe, expect, it } from "vitest";
import {
  entryTimeFor,
  formatSchedule,
  formatWorkDays,
  parseEntryTimes,
  sameTimeEveryDay,
  worksOn,
  type Schedule,
} from "@/lib/attendance/schedule";
import { scheduleSchema } from "@/lib/validation";
import { zodFieldErrors } from "@/lib/action-result";

const lunToSab: Schedule = { workDays: [1, 2, 3, 4, 5, 6], entryTime: "07:00:00", entryTimes: {} };

describe("horario por empleado", () => {
  it("días de trabajo: 2026-10-04 es domingo, 2026-10-05 es lunes", () => {
    expect(worksOn(lunToSab, "2026-10-04")).toBe(false);
    expect(worksOn(lunToSab, "2026-10-05")).toBe(true);
    expect(worksOn({ ...lunToSab, workDays: [7] }, "2026-10-04")).toBe(true);
  });

  it("misma hora todos los días o una hora por día", () => {
    expect(sameTimeEveryDay(lunToSab)).toBe(true);
    expect(entryTimeFor(lunToSab, "2026-10-05")).toBe("07:00");
    const varied: Schedule = { ...lunToSab, entryTimes: { "1": "07:00", "6": "08:30" } };
    expect(sameTimeEveryDay(varied)).toBe(false);
    expect(entryTimeFor(varied, "2026-10-03")).toBe("08:30"); // sábado
    expect(entryTimeFor(varied, "2026-10-01")).toBe("07:00"); // jueves sin hora propia → hora general
  });

  it("ignora datos inválidos guardados en entry_times", () => {
    expect(parseEntryTimes({ "1": "07:00", "8": "07:00", "2": "25:00", x: "07:00", "3": 7 })).toEqual({ "1": "07:00" });
    expect(parseEntryTimes(null)).toEqual({});
    expect(parseEntryTimes(["07:00"])).toEqual({});
  });

  it("resúmenes legibles", () => {
    expect(formatWorkDays([1, 2, 3, 4, 5, 6])).toBe("Lun–Sáb");
    expect(formatWorkDays([7])).toBe("Dom");
    expect(formatWorkDays([1, 3, 5])).toBe("Lun, Mié, Vie");
    expect(formatWorkDays([1, 2, 3, 4, 5, 6, 7])).toBe("Todos los días");
    expect(formatSchedule(lunToSab)).toBe("Lun–Sáb · 07:00");
    expect(
      formatSchedule({
        workDays: [1, 2, 3, 4, 5, 6],
        entryTime: "07:00",
        entryTimes: { "1": "07:00", "2": "07:00", "3": "07:00", "4": "07:00", "5": "07:00", "6": "08:00" },
      }),
    ).toBe("Lun–Vie 07:00 · Sáb 08:00");
  });
});

describe("validación del formulario de horario", () => {
  it("misma hora: guarda una sola hora y entry_times vacío", () => {
    const r = scheduleSchema.parse({ work_days: ["6", "1", "1"], same_time: true, entry_time: "07:30", day_times: {} });
    expect(r).toEqual({ work_days: [1, 6], entry_time: "07:30", entry_times: {} });
  });

  it("hora por día: solo los días elegidos, y entry_time = la del primer día", () => {
    const r = scheduleSchema.parse({
      work_days: ["7", "6"],
      same_time: false,
      entry_time: "",
      day_times: { "6": "08:00", "7": "09:00", "1": "05:00" },
    });
    expect(r).toEqual({ work_days: [6, 7], entry_time: "08:00", entry_times: { "6": "08:00", "7": "09:00" } });
  });

  it("errores claros por campo", () => {
    const none = scheduleSchema.safeParse({ work_days: [], same_time: true, entry_time: "07:00", day_times: {} });
    expect(none.success).toBe(false);
    if (!none.success) expect(zodFieldErrors(none.error).work_days).toMatch(/al menos un día/);

    const missing = scheduleSchema.safeParse({ work_days: ["1", "6"], same_time: false, day_times: { "1": "07:00", "6": "" } });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(Object.keys(zodFieldErrors(missing.error))).toEqual(["entry_time_6"]);

    const bad = scheduleSchema.safeParse({ work_days: ["1"], same_time: true, entry_time: "7am", day_times: {} });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(zodFieldErrors(bad.error).entry_time).toMatch(/Hora inválida/);

    expect(scheduleSchema.safeParse({ work_days: ["0"], same_time: true, entry_time: "07:00" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ work_days: ["8"], same_time: true, entry_time: "07:00" }).success).toBe(false);
  });
});
