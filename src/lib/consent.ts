/**
 * Texto del consentimiento informado para el tratamiento de datos biométricos
 * (Ley Orgánica de Protección de Datos Personales del Ecuador, LOPDP).
 * IMPORTANTE: es una base redactada para el sistema; debe ser revisada por un
 * abogado antes de usarla con empleados reales. Si el texto cambia, sube la versión.
 */
export const CONSENT_VERSION = "v1-2026-10";

export const CONSENT_TITLE =
  "Consentimiento informado para el tratamiento de datos biométricos (reconocimiento facial)";

export const CONSENT_PARAGRAPHS: string[] = [
  "Responsable del tratamiento: JerezCons (ferretería), con sucursales en Pucará y Rumicucho, Quito, Ecuador.",
  "Finalidad única: verificar mi identidad al registrar mi asistencia (entrada, salida y regreso de almuerzo, salida final) en el sistema JerezCons Asistencia. Mis datos biométricos no se usarán para ningún otro fin.",
  "Datos que se tratan: un vector numérico (plantilla biométrica) calculado a partir de mi rostro. NO se guardan las fotografías del registro inicial. Al marcar asistencia puede guardarse una miniatura de baja resolución como evidencia, que se elimina automáticamente después del plazo de retención configurado.",
  "Base legal: mi consentimiento libre, específico, informado e inequívoco, conforme a la LOPDP. Los datos biométricos son datos sensibles y reciben medidas de seguridad reforzadas (cifrado en tránsito, acceso restringido al administrador, registro de auditoría).",
  "Conservación: mientras dure mi relación laboral o hasta que retire este consentimiento. Al terminar la relación laboral mis datos biométricos serán eliminados.",
  "Mis derechos: puedo solicitar en cualquier momento el acceso, rectificación, eliminación, oposición, portabilidad o suspensión del tratamiento de mis datos, y retirar este consentimiento sin efectos retroactivos, comunicándolo por escrito a la administración de JerezCons.",
  "Alternativa: si no deseo otorgar este consentimiento, puedo solicitar un método alternativo de registro de asistencia, sin que ello implique ninguna sanción o trato diferenciado.",
];
