// Copia los modelos de reconocimiento facial desde node_modules a /public/models.
// Se ejecuta automáticamente en `npm install` (postinstall), así la versión de
// los modelos siempre coincide con la de la librería instalada.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@vladmandic", "face-api", "model");
const dst = join(root, "public", "models");

// Solo los 3 modelos que usa la app: detector, 68 puntos y descriptor.
const files = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

if (!existsSync(src)) {
  console.warn("[models] @vladmandic/face-api no está instalado todavía; se omite la copia.");
  process.exit(0);
}

mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`[models] ${files.length} archivos copiados a public/models`);
