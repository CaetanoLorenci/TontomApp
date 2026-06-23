// Iconografia Amplia Hub — desenhada em código, grid 24, stroke 1.6, herda currentColor.
// Zero emoji. Consistência > variedade.

type IconProps = { size?: number; className?: string };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

/* Marca: ponto que emite ondas (sonar). As ondas pulsam via CSS (.sonar-ring). */
export function LogoMark({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="13" cy="16" r="3.2" fill="var(--color-signal)" />
      <path
        d="M19 10.5a7.5 7.5 0 0 1 0 11"
        stroke="var(--color-signal)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M23 7a13 13 0 0 1 0 18"
        stroke="var(--color-signal)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

/* Conversa (bolha) */
export function IconChat({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />
    </svg>
  );
}

/* Rastreio (mira) */
export function IconTarget({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

/* Conversão (tendência) */
export function IconTrend({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M3 17l5.2-5.2 3.6 3.6L21 7" />
      <path d="M15.5 7H21v5.5" />
    </svg>
  );
}

/* Venda (selo) */
export function IconSale({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.2 12.4l1.9 1.9 3.9-4.4" />
    </svg>
  );
}

/* Faturamento (cédula) */
export function IconCash({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <rect x="3" y="7" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12.5" r="2.6" />
      <path d="M6.5 10.2v.01M17.5 14.8v.01" />
    </svg>
  );
}

/* Origem (torre de sinal) */
export function IconBroadcast({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="11" r="2" />
      <path d="M12 13.5V20" />
      <path d="M8.5 7.5a5 5 0 0 0 0 7" />
      <path d="M15.5 7.5a5 5 0 0 1 0 7" />
      <path d="M5.8 4.8a9 9 0 0 0 0 12.4" />
      <path d="M18.2 4.8a9 9 0 0 1 0 12.4" />
    </svg>
  );
}

/* Funil */
export function IconFunnel({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4 5h16l-6.2 7.2V19l-3.6-2v-4.8L4 5Z" />
    </svg>
  );
}

/* Download */
export function IconDownload({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M12 4v10M8 10.5l4 3.5 4-3.5" />
      <path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
    </svg>
  );
}

/* Alerta (sem rastreio) */
export function IconWarn({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M12 4.5 21 19H3L12 4.5Z" />
      <path d="M12 10v4M12 16.8v.01" />
    </svg>
  );
}

/* Confirmado no Meta */
export function IconMetaOk({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </svg>
  );
}

/* Seta de avanço de estágio */
export function IconAdvance({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M5 12h13M13.5 6.5 19 12l-5.5 5.5" />
    </svg>
  );
}

/* Telefone */
export function IconPhone({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a11.5 11.5 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

/* Agenda (calendário) */
export function IconCalendar({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
      <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01" />
    </svg>
  );
}

/* Relógio (horário) */
export function IconClock({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.8" />
    </svg>
  );
}

/* Sino (notificações). filled = estado ativo. */
export function IconBell({ size = 18, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} className={className} aria-hidden fill={filled ? "currentColor" : "none"}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6 2 7H4c.5-1 2-2 2-7Z" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

/* Criativo (imagem) */
export function IconImage({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4.5-4.2a1.6 1.6 0 0 1 2.2 0L19 19" />
    </svg>
  );
}

/* Projetos (pasta) */
export function IconFolder({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4 7.5a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.5.7l1 1.3H18a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
