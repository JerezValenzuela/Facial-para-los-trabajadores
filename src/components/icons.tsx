// Iconos SVG en línea (sin dependencias). Trazo heredado de currentColor.
type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const IconClock = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconUsers = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
export const IconStore = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6" />
  </svg>
);
export const IconShield = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);
export const IconBell = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
export const IconSettings = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconLogout = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const IconDownload = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);
export const IconCamera = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
export const IconPlus = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconTrash = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);
export const IconCheck = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
export const IconAlert = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
export const IconMenu = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);

// Variante de trazo recto (inicio): extremos cuadrados y grosor configurable.
type Q = P & { strokeWidth?: number };
const square = (strokeWidth: number) => ({ ...base, strokeWidth, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const });

export const IconScanFace = ({ className = "h-16 w-16", strokeWidth = 1.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </svg>
);
export const IconTap = ({ className = "h-[18px] w-[18px]", strokeWidth = 2.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
    <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);
export const IconArrowRight = ({ className = "h-7 w-7", strokeWidth = 2 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
export const IconLayout = ({ className = "h-7 w-7", strokeWidth = 2 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);
export const IconArrowLeft = ({ className = "h-[18px] w-[18px]", strokeWidth = 2.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
export const IconTarget = ({ className = "h-11 w-11", strokeWidth = 2.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);
export const IconCameraLine = ({ className = "h-10 w-10", strokeWidth = 1.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
export const IconCheckLine = ({ className = "h-[18px] w-[18px]", strokeWidth = 3 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const IconFileText = ({ className = "h-[26px] w-[26px]", strokeWidth = 2 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h6M9 13h6M9 17h4" />
  </svg>
);
export const IconAlertLine = ({ className = "h-8 w-8", strokeWidth = 2.5 }: Q) => (
  <svg {...square(strokeWidth)} className={className}>
    <path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01" />
  </svg>
);
