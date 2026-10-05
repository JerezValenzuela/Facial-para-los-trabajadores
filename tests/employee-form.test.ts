/**
 * Ida y vuelta del formulario del empleado: se dibuja el formulario REAL con
 * los datos guardados, se arma lo que enviaría el navegador y se pasa por el
 * mismo lector que usa el servidor. Así se comprueba que al editar se ve el
 * horario guardado y que al guardar (o cambiarlo) se conserva bien.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/dashboard/empleados/actions", () => ({
  createEmployeeAction: async () => ({ ok: true }),
  updateEmployeeAction: async () => ({ ok: true }),
}));

import { EmployeeForm } from "@/app/dashboard/empleados/employee-form";
import { parseEmployeeForm } from "@/lib/validation";

const BRANCH = "11111111-1111-4111-8111-111111111111";
const branches = [{ id: BRANCH, name: "Pucará" }];
const base = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Ana Pérez",
  cedula: "1712345675",
  branch_id: BRANCH,
  position: "Vendedora",
};

/** Lo que el navegador enviaría al pulsar "Guardar" (inputs con name, checkboxes marcados, select elegido). */
function submitted(html: string): FormData {
  const fd = new FormData();
  for (const m of html.matchAll(/<input\b([^>]*?)\/?>/g)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? ""]));
    if (!attrs.name) continue;
    if (attrs.type === "checkbox") {
      if ("checked" in attrs) fd.append(attrs.name, attrs.value || "on");
      continue;
    }
    fd.append(attrs.name, attrs.value ?? "");
  }
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = m[2].match(/<option\b[^>]*value="([^"]*)"[^>]*selected=""/) ?? m[2].match(/<option\b[^>]*selected=""[^>]*value="([^"]*)"/);
    if (selected) fd.append(m[1], selected[1]);
  }
  return fd;
}

const render = (props: Parameters<typeof EmployeeForm>[0]) => renderToStaticMarkup(createElement(EmployeeForm, props));

describe("formulario del empleado: editar el horario", () => {
  it("muestra el horario guardado con hora distinta por día y se guarda igual", () => {
    const html = render({
      branches,
      employee: { ...base, entry_time: "08:00:00", work_days: [6, 7], entry_times: { "6": "08:00", "7": "09:30" } },
    });
    const fd = submitted(html);
    expect(fd.getAll("work_days")).toEqual(["6", "7"]);
    expect(fd.get("same_time")).toBeNull(); // interruptor apagado
    expect(fd.get("entry_time_6")).toBe("08:00");
    expect(fd.get("entry_time_7")).toBe("09:30");
    expect(fd.get("entry_time_1")).toBeNull(); // días que no trabaja: sin hora

    const parsed = parseEmployeeForm(fd);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        branch_id: BRANCH,
        work_days: [6, 7],
        entry_time: "08:00",
        entry_times: { "6": "08:00", "7": "09:30" },
      });
    }
  });

  it("misma hora todos los días: se ve una sola hora y se guarda igual", () => {
    const html = render({ branches, employee: { ...base, entry_time: "07:00:00", work_days: [1, 2, 3, 4, 5, 6], entry_times: {} } });
    const fd = submitted(html);
    expect(fd.get("same_time")).toBe("on");
    expect(fd.get("entry_time")).toBe("07:00");
    expect(fd.getAll("work_days")).toEqual(["1", "2", "3", "4", "5", "6"]);
    const parsed = parseEmployeeForm(fd);
    expect(parsed.success && parsed.data).toMatchObject({ work_days: [1, 2, 3, 4, 5, 6], entry_time: "07:00", entry_times: {} });
  });

  it("cambiar el horario al editar: quitar el domingo y poner el sábado más tarde", () => {
    const fd = submitted(
      render({ branches, employee: { ...base, entry_time: "07:00:00", work_days: [1, 2, 3, 4, 5, 6, 7], entry_times: {} } }),
    );
    // Lo que hace el administrador en pantalla: desmarca "Dom", apaga "misma hora" y cambia el sábado.
    const days = fd.getAll("work_days").filter((d) => d !== "7");
    fd.delete("work_days");
    days.forEach((d) => fd.append("work_days", d));
    fd.delete("same_time");
    fd.delete("entry_time");
    for (const d of days) fd.set(`entry_time_${d}`, d === "6" ? "08:30" : "07:00");

    const parsed = parseEmployeeForm(fd);
    expect(parsed.success && parsed.data).toMatchObject({
      work_days: [1, 2, 3, 4, 5, 6],
      entry_time: "07:00",
      entry_times: { "1": "07:00", "2": "07:00", "3": "07:00", "4": "07:00", "5": "07:00", "6": "08:30" },
    });
  });

  it("empleado nuevo: vienen marcados los días por defecto de Configuración", () => {
    const fd = submitted(render({ branches, defaultWorkDays: [1, 2, 3, 4, 5] }));
    expect(fd.getAll("work_days")).toEqual(["1", "2", "3", "4", "5"]);
    expect(fd.get("same_time")).toBe("on");
    expect(fd.get("entry_time")).toBe("08:00");
  });

  it("si se desmarcan todos los días, el error sale en el campo de días", () => {
    const fd = submitted(render({ branches, employee: { ...base, entry_time: "07:00:00", work_days: [1], entry_times: {} } }));
    fd.delete("work_days");
    const parsed = parseEmployeeForm(fd);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.fieldErrors.work_days).toMatch(/al menos un día/);
  });
});
