import { Archivo, Inter } from "next/font/google";

/** Fuente de las pantallas públicas (inicio y kiosco). Variable: todos los pesos. */
export const archivo = Archivo({ subsets: ["latin"], display: "swap" });

/** Fuente del panel de administración. */
export const inter = Inter({ subsets: ["latin"], display: "swap" });
