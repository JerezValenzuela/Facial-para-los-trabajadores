import { PageHeader, Notice } from "@/components/ui";

// Página provisional: la tabla de asistencia se construye en la fase 9.
export default function AttendancePage() {
  return (
    <>
      <PageHeader title="Asistencia" description="Resumen diario por empleado" />
      <Notice tone="info">La tabla de asistencia estará disponible en breve.</Notice>
    </>
  );
}
