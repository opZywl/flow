"use client"

import { type ChangeEvent, type FormEvent, useId, useRef, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { AlertTriangle, Check, Moon, Palette, Sun, X } from "lucide-react"
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ui } from "./flow/ui"
import { useTheme } from "./ThemeContext"

const CUSTOM_THEME_NAME = "Personalizada"
const TRIGGER_SELECTOR = "[data-color-panel-trigger]"
const DEFAULT_ACCENT = "#3b82f6"
const MIN_CONTRAST = 2

const PRESET_LABELS: Record<string, string> = {
  "Blue Purple": "Azul",
  "Green Teal": "Verde",
  "Orange Red": "Laranja",
  "Purple Pink": "Violeta",
  "Cyan Blue": "Ciano",
}

const THEME_OPTIONS = [
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "light", label: "Claro", Icon: Sun },
] as const

function normalizeHex(value: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function accentHex(gradient: string) {
  return gradient.match(/#[0-9a-f]{6}/i)?.[0].toLowerCase() ?? DEFAULT_ACCENT
}

function relativeLuminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: number, second: number) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const LIGHT_CANVAS = relativeLuminance("#ffffff")
const DARK_CANVAS = relativeLuminance("#121212")

function visibilityWarning(hex: string) {
  const luminance = relativeLuminance(hex)
  if (contrastRatio(luminance, LIGHT_CANVAS) < MIN_CONTRAST) {
    return "Cor muito clara: botões e conexões podem ficar pouco legíveis."
  }
  if (contrastRatio(luminance, DARK_CANVAS) < MIN_CONTRAST) {
    return "Cor muito escura: conexões e seleção podem ficar pouco visíveis no tema escuro."
  }
  return null
}

function ColorPanelBody() {
  const { theme, toggleTheme, gradientThemes, currentGradient, setGradientTheme } = useTheme()
  const id = useId()
  const currentHex = accentHex(currentGradient.primary)
  const [pickerHex, setPickerHex] = useState(currentHex)
  const [hexText, setHexText] = useState(currentHex)

  const draftHex = normalizeHex(hexText)
  const customActive = currentGradient.name === CUSTOM_THEME_NAME
  const invalid = hexText.trim() !== "" && draftHex === null
  const warning = draftHex ? visibilityWarning(draftHex) : null
  const canApply = draftHex !== null && !(customActive && draftHex === currentHex)
  const messageId = `${id}-mensagem`
  const themeTitleId = `${id}-tema`
  const accentTitleId = `${id}-destaque`
  const customTitleId = `${id}-personalizada`

  const syncDraft = (hex: string) => {
    setPickerHex(hex)
    setHexText(hex)
  }

  const handleHexChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setHexText(value)
    const hex = normalizeHex(value)
    if (hex) setPickerHex(hex)
  }

  const applyCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draftHex) return
    syncDraft(draftHex)
    setGradientTheme({
      name: CUSTOM_THEME_NAME,
      primary: `linear-gradient(135deg, ${draftHex} 0%, ${draftHex} 100%)`,
      secondary: `linear-gradient(135deg, ${draftHex}cc 0%, ${draftHex}cc 100%)`,
      accent: `linear-gradient(135deg, ${draftHex} 0%, ${draftHex} 100%)`,
      glow: `${draftHex}99`,
    })
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <section aria-labelledby={themeTitleId} className="space-y-2">
        <h3 id={themeTitleId} className={ui.sectionTitle}>
          Tema
        </h3>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-flow-border bg-flow-soft p-1">
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (!active) toggleTheme()
                }}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
                  active ? "bg-flow-accent text-white shadow-sm" : "text-flow-muted-strong hover:bg-flow-surface hover:text-flow-fg",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby={accentTitleId} className="space-y-2">
        <h3 id={accentTitleId} className={ui.sectionTitle}>
          Cor de destaque
        </h3>
        <div className="grid grid-cols-5 gap-1">
          {gradientThemes.map((gradient) => {
            const hex = accentHex(gradient.primary)
            const label = PRESET_LABELS[gradient.name] ?? gradient.name
            const active = currentGradient.name === gradient.name
            return (
              <button
                key={gradient.name}
                type="button"
                aria-pressed={active}
                title={label}
                onClick={() => {
                  setGradientTheme(gradient)
                  syncDraft(hex)
                }}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-medium transition hover:bg-flow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
                  active ? "text-flow-fg" : "text-flow-muted-strong",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm",
                    active && "ring-2 ring-flow-accent ring-offset-2 ring-offset-flow-surface",
                  )}
                  style={{ backgroundColor: hex }}
                >
                  {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </span>
                <span className="max-w-full truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby={customTitleId} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id={customTitleId} className={ui.sectionTitle}>
            Cor personalizada
          </h3>
          {customActive ? (
            <span className="rounded-md bg-flow-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-flow-accent">Em uso</span>
          ) : null}
        </div>
        <form onSubmit={applyCustom} className="flex items-center gap-2">
          <input
            type="color"
            value={pickerHex}
            onChange={(event) => syncDraft(event.target.value)}
            aria-label="Escolher cor no seletor"
            title="Escolher cor"
            className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-flow-border bg-flow-surface p-1 transition hover:border-flow-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/25 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
          />
          <input
            type="text"
            value={hexText}
            onChange={handleHexChange}
            onBlur={() => {
              if (draftHex) setHexText(draftHex)
            }}
            aria-label="Código hexadecimal da cor"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid || warning ? messageId : undefined}
            placeholder={DEFAULT_ACCENT}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            className={cn(ui.input, "min-w-0 flex-1 font-mono")}
          />
          <button type="submit" disabled={!canApply} className={cn(ui.primaryButton, "h-9")}>
            Aplicar
          </button>
        </form>
        {invalid ? (
          <p id={messageId} className={ui.error}>
            Use o formato #RRGGBB.
          </p>
        ) : warning ? (
          <p id={messageId} className={cn(ui.hint, "flex items-start gap-1.5 text-flow-warning")}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ) : null}
      </section>
    </div>
  )
}

export default function ColorPanel() {
  const { showColorPanel, setShowColorPanel } = useTheme()
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const interactedOutsideRef = useRef(false)

  return (
    <Dialog open={showColorPanel} onOpenChange={setShowColorPanel} modal={false}>
      <DialogPortal>
        <DialogPrimitive.Content
          onOpenAutoFocus={() => {
            const active = document.activeElement
            returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
            interactedOutsideRef.current = false
          }}
          onInteractOutside={(event) => {
            const target = event.target
            const opener = returnFocusRef.current
            const onTrigger =
              target instanceof Element && (Boolean(opener?.contains(target)) || target.closest(TRIGGER_SELECTOR) !== null)
            if (onTrigger) {
              event.preventDefault()
              return
            }
            interactedOutsideRef.current = true
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = returnFocusRef.current
            if (!interactedOutsideRef.current && target?.isConnected) target.focus()
          }}
          className={cn(
            ui.card,
            "fixed right-3 top-[3.75rem] z-50 flex max-h-[calc(100dvh-4.5rem)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden text-flow-fg shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-flow-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent">
                <Palette className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm font-semibold leading-tight text-flow-fg">Cores</DialogTitle>
                <DialogDescription className="mt-0.5 text-[11px] leading-tight text-flow-muted">
                  Tema e cor de destaque do editor
                </DialogDescription>
              </div>
            </div>
            <DialogClose
              aria-label="Fechar cores"
              title="Fechar"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogClose>
          </div>

          <ColorPanelBody />

          <p className="border-t border-flow-border px-4 py-3 text-[11px] leading-4 text-flow-muted">
            A cor de destaque aparece na seleção, nas conexões e nos botões principais.
          </p>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
