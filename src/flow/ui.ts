export const ui = {
  toolButton:
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-flow-border bg-flow-surface text-flow-muted-strong transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40",
  toolButtonActive: "border-flow-accent bg-flow-accent/15 text-flow-accent hover:text-flow-accent",
  button:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-flow-border bg-flow-surface px-2.5 text-xs font-semibold text-flow-muted-strong transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40",
  primaryButton:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-flow-accent-strong px-3 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/40 disabled:pointer-events-none disabled:opacity-40",
  accentButton:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-flow-accent/40 bg-flow-accent/15 px-3 text-xs font-semibold text-flow-accent transition hover:bg-flow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40",
  dangerButton:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-flow-border bg-flow-surface px-2.5 text-xs font-semibold text-flow-muted-strong transition hover:border-flow-danger hover:text-flow-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-danger/30 disabled:pointer-events-none disabled:opacity-40",
  linkButton: "text-xs font-semibold text-flow-accent transition hover:underline disabled:pointer-events-none disabled:opacity-40",
  divider: "mx-1 h-5 w-px shrink-0 bg-flow-border",
  input:
    "h-9 w-full rounded-lg border border-flow-border bg-flow-surface px-2.5 text-sm text-flow-fg placeholder:text-flow-muted transition hover:border-flow-accent/50 focus-visible:border-flow-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/25",
  textarea:
    "min-h-24 w-full rounded-lg border border-flow-border bg-flow-surface px-2.5 py-2 text-sm text-flow-fg placeholder:text-flow-muted transition hover:border-flow-accent/50 focus-visible:border-flow-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/25",
  select:
    "h-9 w-full rounded-lg border border-flow-border bg-flow-surface px-2 text-sm text-flow-fg transition hover:border-flow-accent/50 focus-visible:border-flow-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/25",
  label: "mb-1 block text-xs font-semibold text-flow-muted-strong",
  hint: "mt-1 text-[11px] leading-4 text-flow-muted",
  error: "mt-1 text-[11px] font-medium leading-4 text-flow-danger",
  warning: "mt-1 text-[11px] font-medium leading-4 text-flow-warning",
  sectionTitle: "text-[10px] font-bold uppercase tracking-wider text-flow-muted",
  card: "rounded-xl border border-flow-border bg-flow-surface",
  chip: "rounded-md bg-flow-soft px-2 py-1 text-[11px] text-flow-muted-strong",
  panel: "border-flow-border bg-flow-menu text-flow-fg",
  overlay: "rounded-xl border border-flow-border bg-flow-surface/95 text-flow-fg shadow-xl backdrop-blur",
  dialog: "border-flow-border bg-flow-surface text-flow-fg",
} as const
