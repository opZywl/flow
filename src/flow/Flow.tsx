"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ArrowRightLeft, Bot, Camera, EllipsisVertical, ImageIcon, Link2, Loader2, Maximize2, Minus, Moon, Palette, Play, RotateCcw, Search, SendHorizontal, Sparkles, Sun, WandSparkles, Workflow, X, type LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { START_TYPE, getCategory, getComponentColor, getComponentLabel } from "@/lib/atendimento/catalog"
import { behaviorSignature, exportFileName, importFlow, isObject } from "@/lib/atendimento/format"
import { emptyPreview, replyPreview, startPreview, type PreviewState } from "@/lib/atendimento/simulator"
import type { AtendimentoFlow } from "@/lib/atendimento/types"
import { useTheme } from "../ThemeContext"
import type { CopilotAttention } from "./ai/copilot-store"
import { useAiSettingsDialog } from "./ai/settings-store"
import EraDialog from "./era-dialog"
import WorkflowBuilder, { type PreviewKind, type WorkflowActions } from "./workflow-builder"
import { categoryTint, componentIcon, nodeSummary } from "./nodes/atendimento-node"
import { PICK_MIN_WIDTH } from "./canvas-frame"
import type { CanvasPick } from "./pick"
import { ui } from "./ui"

const AIWorkflowDialog = dynamic(() => import("./ai-workflow-dialog"), { ssr: false })
const AICopilot = dynamic(() => import("./ai-copilot"), { ssr: false })
const AiSettingsDialog = dynamic(() => import("./ai-settings-dialog"), { ssr: false })

const ERA_VISIBLE = false

type LivePreviewProps = {
  onLivePreview: (flow: AtendimentoFlow | null, done?: boolean, kind?: PreviewKind, fresh?: boolean, focus?: string | null) => void
  getCurrentFlow: () => AtendimentoFlow | null
  onWorkflowEdited: (workflow: AtendimentoFlow) => boolean
}
const ColorPanel = dynamic(() => import("../ColorPanel"), { ssr: false })

const warm = (load: () => Promise<unknown>) => () => {
  void load().catch(() => undefined)
}

const warmAI = warm(() => import("./ai-workflow-dialog"))
const warmCopilot = warm(() => import("./ai-copilot"))
const warmColors = warm(() => import("../ColorPanel"))

const WORKFLOW_KEY = "workflow"
const EXECUTED_KEY = "executedFlow"
const BACKGROUND_KEY = "flow-background-image"
const BACKGROUND_VARIABLE = "--flow-background-image"
const HEADER_HEIGHT = 56
const BOT_GAP = 16
const COPILOT_WIDTH = 384
const WIDE_QUERY = "(min-width: 1024px)"
const TOOLS_QUERY = "(min-width: 640px)"
const CANVAS_PICK_QUERY = `(min-width: ${COPILOT_WIDTH + PICK_MIN_WIDTH}px)`
const SEARCH_LIMIT = 50
const IMAGE_TIMEOUT = 15000

const READY_MESSAGE = "Fluxo carregado. Envie qualquer mensagem para iniciar o atendimento."
const IDLE_MESSAGE = "Nenhuma prévia ativa. Clique em Iniciar prévia para testar o fluxo atual."
const CHANGED_MESSAGE = "O fluxo foi alterado. Clique em Iniciar prévia para testar a versão atual."
const INACTIVE_REPLY = "A prévia está inativa. Clique em Iniciar prévia para testar o fluxo atual."

const COPILOT_ATTENTION: Readonly<Record<CopilotAttention, string>> = {
  ready: ", edição pronta para revisar",
  failed: ", edição não concluída",
  question: ", pergunta para responder",
}

const ghostButton =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"

const moreContent =
  "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-flow-border bg-flow-surface py-1 text-flow-fg shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 motion-reduce:animate-none"

const moreItem =
  "flex w-full cursor-pointer select-none items-start gap-2.5 px-3 py-2 text-left outline-none transition-colors data-[highlighted]:bg-flow-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-40"

interface StoredWorkflow {
  raw: string | null
  executed: boolean
}

interface SearchItem {
  id: string
  label: string
  detail: string
  color: string
  icon: LucideIcon
  text: string
}

interface BotMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

const cssUrl = (url: string) => `url("${url.replace(/["\\\n\r\f]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `)}")`

function setBackgroundVariable(url: string | null) {
  const root = document.documentElement
  if (url) root.style.setProperty(BACKGROUND_VARIABLE, cssUrl(url))
  else root.style.removeProperty(BACKGROUND_VARIABLE)
}

function imageUrlFrom(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^data:image\/[\w.+-]+[;,]/i.test(trimmed)) return trimmed
  const relative = trimmed.startsWith("/")
  const candidate = relative || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate, window.location.href)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return relative ? trimmed : parsed.href
  } catch {
    return null
  }
}

function loadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => reject(new Error("timeout")), IMAGE_TIMEOUT)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve()
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error("error"))
    }
    image.src = url
  })
}

function readStoredWorkflow(): StoredWorkflow {
  try {
    return { raw: localStorage.getItem(WORKFLOW_KEY), executed: localStorage.getItem(EXECUTED_KEY) === "true" }
  } catch {
    return { raw: null, executed: false }
  }
}

function parseFlow(input: unknown): AtendimentoFlow | null {
  try {
    return importFlow(input)
  } catch {
    return null
  }
}

function loadExecutedFlow(): AtendimentoFlow | null {
  const stored = readStoredWorkflow()
  return stored.executed && stored.raw ? parseFlow(stored.raw) : null
}

function storedFlowName(): string {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "null")
    return isObject(parsed) && typeof parsed.name === "string" ? parsed.name : ""
  } catch {
    return ""
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function searchItems(raw: string | null): SearchItem[] {
  const flow = raw ? parseFlow(raw) : null
  if (!flow) return []
  return flow.nodes.map((node) => {
    const type = node.data.type
    const label = getComponentLabel(type)
    const summary = type === START_TYPE ? "Início do atendimento" : nodeSummary(node.data)
    return {
      id: node.id,
      label,
      detail: summary || getCategory(type)?.label || type,
      color: type === START_TYPE ? "rgb(var(--flow-success))" : getComponentColor(type),
      icon: componentIcon(type),
      text: normalizeText(`${node.id} ${label} ${type} ${summary}`),
    }
  })
}

function filterItems(items: SearchItem[], query: string): SearchItem[] {
  const term = normalizeText(query.trim())
  if (!term) return items
  const exact = items.filter((item) => normalizeText(item.id) === term)
  const partial = items.filter((item) => normalizeText(item.id) !== term && item.text.includes(term))
  return [...exact, ...partial]
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

function useStoredWorkflow(): StoredWorkflow {
  const [stored, setStored] = useState<StoredWorkflow>(readStoredWorkflow)

  useEffect(() => {
    const sync = () => {
      const next = readStoredWorkflow()
      setStored((current) => (current.raw === next.raw && current.executed === next.executed ? current : next))
    }
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener("workflow:executed", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("workflow:executed", sync)
    }
  }, [])

  return stored
}

function HeaderSearch({ raw, onSearch }: { raw: string | null; onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const items = useMemo(() => (open ? searchItems(raw) : []), [open, raw])
  const matches = useMemo(() => filterItems(items, query), [items, query])
  const results = matches.length > SEARCH_LIMIT ? matches.slice(0, SEARCH_LIMIT) : matches
  const activeIndex = results.length ? Math.min(active, results.length - 1) : -1
  const expanded = open && results.length > 0
  const optionId = useCallback((index: number) => `${listId}-option-${index}`, [listId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return
      const input = inputRef.current
      if (!input || input.closest('[aria-hidden="true"], [inert]')) return
      event.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!expanded || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, expanded, optionId])

  const choose = (item: SearchItem) => {
    setOpen(false)
    inputRef.current?.blur()
    onSearch(item.id)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (expanded && activeIndex >= 0) {
      choose(results[activeIndex])
      return
    }
    if (!query.trim()) return
    setOpen(false)
    onSearch(query)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
        return
      }
      if (!results.length) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((activeIndex + step + results.length) % results.length)
      return
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault()
        setOpen(false)
      } else if (query) {
        event.preventDefault()
        setQuery("")
      }
      return
    }
    if (event.key === "Tab") setOpen(false)
  }

  const announcement = !open ? "" : matches.length ? `${matches.length} ${matches.length === 1 ? "componente encontrado" : "componentes encontrados"}` : "Nenhum componente encontrado"

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-flow-muted" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        value={query}
        placeholder="Buscar componente…"
        aria-label="Buscar componente no fluxo"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(Boolean(event.target.value.trim()))
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={cn(ui.input, "pl-9", query ? "pr-9" : "md:pr-16")}
      />
      {query ? (
        <button
          type="button"
          aria-label="Limpar busca"
          title="Limpar busca"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery("")
            setOpen(false)
            inputRef.current?.focus()
          }}
          className={cn(ghostButton, "absolute right-1 top-1/2 -translate-y-1/2")}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-flow-border bg-flow-soft px-1.5 py-0.5 font-sans text-[10px] font-semibold text-flow-muted md:block">
          Ctrl K
        </kbd>
      )}
      {open && (
        <div onMouseDown={(event) => event.preventDefault()} className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-flow-border bg-flow-surface shadow-lg">
          {results.length ? (
            <ul id={listId} role="listbox" aria-label="Componentes encontrados" className="max-h-80 overflow-y-auto py-1">
              {results.map((item, index) => {
                const Icon = item.icon
                const selected = index === activeIndex
                return (
                  <li
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => {
                      if (!selected) setActive(index)
                    }}
                    onClick={() => choose(item)}
                    className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors", selected && "bg-flow-accent/10")}
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-soft" style={{ color: categoryTint(item.color) }}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-flow-fg">{item.label}</span>
                      <span className="block truncate text-[11px] text-flow-muted">{item.detail}</span>
                    </span>
                    <span className={cn(ui.chip, "shrink-0 font-mono text-[10px]")}>ID {item.id}</span>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {matches.length > results.length && (
            <p className="border-t border-flow-border px-3 py-2 text-[11px] text-flow-muted">
              Mostrando {results.length} de {matches.length}. Refine a busca para ver os demais.
            </p>
          )}
          {!results.length && (
            <p className="px-3 py-6 text-center text-xs text-flow-muted">
              {query.trim() ? `Nenhum componente corresponde a “${query.trim()}”.` : "O fluxo ainda não tem componentes."}
            </p>
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </form>
  )
}

function PreviewStatus({ active }: { active: boolean }) {
  return (
    <span
      aria-live="polite"
      title={active ? "A prévia usa a versão atual do fluxo" : "Clique em Prévia na barra do editor para testar o fluxo"}
      className={cn(
        "hidden h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold md:inline-flex",
        active ? "border-flow-success/40 bg-flow-success/10 text-flow-success" : "border-flow-border bg-flow-soft text-flow-muted",
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-flow-success" : "bg-flow-muted")} />
      {active ? "Prévia ativa" : "Prévia inativa"}
    </span>
  )
}

function MenuAction({ icon: Icon, label, description, disabled, onSelect }: { icon: LucideIcon; label: string; description: string; disabled?: boolean; onSelect: () => void }) {
  const descriptionId = useId()
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-label={label}
      aria-describedby={descriptionId}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-flow-strong focus-visible:bg-flow-strong focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-flow-muted" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-flow-fg">{label}</span>
        <span id={descriptionId} className="block text-[11px] leading-4 text-flow-muted">
          {description}
        </span>
      </span>
    </button>
  )
}

function BackgroundMenu({ hasImage, capturing, onChange, onSave, onReset }: { hasImage: boolean; capturing: boolean; onChange: () => void; onSave: () => void; onReset: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open])

  const run = (action: () => void) => {
    setOpen(false)
    triggerRef.current?.focus()
    action()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={capturing || undefined}
        aria-label="Imagem de fundo"
        title="Imagem de fundo"
        className={cn(ui.toolButton, open && ui.toolButtonActive)}
      >
        {capturing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ImageIcon className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Opções da imagem de fundo" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-flow-border bg-flow-surface py-1 shadow-lg">
          <MenuAction icon={Link2} label="Trocar imagem" description="Aplicar uma imagem a partir de um link" onSelect={() => run(onChange)} />
          <MenuAction icon={Camera} label="Salvar imagem do canvas" description="Baixar o fluxo inteiro em PNG" disabled={capturing} onSelect={() => run(onSave)} />
          <div className="my-1 border-t border-flow-border" />
          <MenuAction
            icon={RotateCcw}
            label="Restaurar padrão"
            description={hasImage ? "Remover a imagem de fundo aplicada" : "Nenhuma imagem de fundo aplicada"}
            disabled={!hasImage}
            onSelect={() => run(onReset)}
          />
        </div>
      )}
    </div>
  )
}

function MoreAction({ icon: Icon, label, description, disabled, onSelect }: { icon: LucideIcon; label: string; description?: string; disabled?: boolean; onSelect: () => void }) {
  const descriptionId = useId()
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      textValue={label}
      onSelect={onSelect}
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
      className={moreItem}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-flow-muted" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-flow-fg">{label}</span>
        {description ? (
          <span id={descriptionId} className="block text-[11px] leading-4 text-flow-muted">
            {description}
          </span>
        ) : null}
      </span>
    </DropdownMenuPrimitive.Item>
  )
}

interface MoreMenuProps {
  theme: string
  hasImage: boolean
  capturing: boolean
  onOpenEra: () => void
  onChangeBackground: () => void
  onSaveImage: () => void
  onResetBackground: () => void
  onOpenColors: () => void
  onToggleTheme: () => void
}

function MoreMenu({ theme, hasImage, capturing, onOpenEra, onChangeBackground, onSaveImage, onResetBackground, onOpenColors, onToggleTheme }: MoreMenuProps) {
  const [open, setOpen] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  const groupId = useId()
  const roomy = useMediaQuery(TOOLS_QUERY)
  const shown = open && !roomy

  useEffect(() => {
    if (roomy) setOpen(false)
  }, [roomy])

  const later = (action: () => void) => () => {
    pending.current = action
  }

  const changeOpen = (next: boolean) => {
    if (next) {
      pending.current = null
      warmColors()
    }
    setOpen(next)
  }

  return (
    <DropdownMenuPrimitive.Root open={shown} onOpenChange={changeOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button type="button" aria-label="Mais opções" title="Mais opções" aria-busy={capturing || undefined} className={cn(ui.toolButton, "sm:hidden", shown && ui.toolButtonActive)}>
          {capturing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <EllipsisVertical className="h-4 w-4" aria-hidden />}
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={() => {
            const action = pending.current
            pending.current = null
            action?.()
          }}
          className={moreContent}
        >
          {ERA_VISIBLE ? (
            <>
              <MoreAction icon={ArrowRightLeft} label="Converter para o padrão ERA" onSelect={later(onOpenEra)} />
              <DropdownMenuPrimitive.Separator className="my-1 border-t border-flow-border" />
            </>
          ) : null}
          <DropdownMenuPrimitive.Group aria-labelledby={groupId}>
            <DropdownMenuPrimitive.Label id={groupId} className={cn(ui.sectionTitle, "px-3 pb-1 pt-1.5")}>
              Imagem de fundo
            </DropdownMenuPrimitive.Label>
            <MoreAction icon={Link2} label="Trocar imagem" description="Aplicar uma imagem a partir de um link" onSelect={later(onChangeBackground)} />
            <MoreAction icon={Camera} label="Salvar imagem do canvas" description="Baixar o fluxo inteiro em PNG" disabled={capturing} onSelect={later(onSaveImage)} />
            <MoreAction
              icon={RotateCcw}
              label="Restaurar padrão"
              description={hasImage ? "Remover a imagem de fundo aplicada" : "Nenhuma imagem de fundo aplicada"}
              disabled={!hasImage}
              onSelect={later(onResetBackground)}
            />
          </DropdownMenuPrimitive.Group>
          <DropdownMenuPrimitive.Separator className="my-1 border-t border-flow-border" />
          <MoreAction icon={Palette} label="Cores" onSelect={later(onOpenColors)} />
          <MoreAction icon={theme === "dark" ? Sun : Moon} label="Alternar tema" onSelect={later(onToggleTheme)} />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

interface FlowHeaderProps {
  botOpen: boolean
  capturing: boolean
  hasBackground: boolean
  copilotId: string
  copilotOpen: boolean
  copilotMounted: boolean
  copilotAttention: CopilotAttention | null
  onSearch: (query: string) => void
  onOpenAI: () => void
  onToggleCopilot: () => void
  onOpenBot: () => void
  onOpenEra: () => void
  onChangeBackground: () => void
  onSaveImage: () => void
  onResetBackground: () => void
}

function FlowHeader({ botOpen, capturing, hasBackground, copilotId, copilotOpen, copilotMounted, copilotAttention, onSearch, onOpenAI, onToggleCopilot, onOpenBot, onOpenEra, onChangeBackground, onSaveImage, onResetBackground }: FlowHeaderProps) {
  const { theme, toggleTheme, showColorPanel, setShowColorPanel } = useTheme()
  const stored = useStoredWorkflow()

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-flow-border bg-flow-menu px-3 sm:gap-3 sm:px-4">
      <h1 className="shrink-0">
        <Link
          href="/"
          aria-label="WorkFlow, página inicial"
          title="Voltar para a página inicial"
          className="flex items-center gap-2 rounded-lg text-flow-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-flow-accent text-white">
            <Workflow className="h-4 w-4" aria-hidden />
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:inline">WorkFlow</span>
        </Link>
      </h1>
      <span aria-hidden className={cn(ui.divider, "hidden sm:block")} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <HeaderSearch raw={stored.raw} onSearch={onSearch} />
        <PreviewStatus active={stored.executed} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenAI}
          onPointerEnter={warmAI}
          onFocus={warmAI}
          aria-haspopup="dialog"
          data-ai-trigger=""
          aria-label="Gerar com IA"
          title="Gerar com IA"
          className={cn(ui.accentButton, "px-2 md:px-3")}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="hidden md:inline">Gerar com IA</span>
        </button>
        <button
          type="button"
          onClick={onToggleCopilot}
          onPointerEnter={warmCopilot}
          onFocus={warmCopilot}
          aria-expanded={copilotOpen}
          aria-controls={copilotMounted ? copilotId : undefined}
          aria-label={copilotAttention ? `Copiloto${COPILOT_ATTENTION[copilotAttention]}` : "Copiloto"}
          data-copilot-trigger=""
          title="Copiloto"
          className={cn(ui.button, "relative px-2 md:px-3", copilotOpen && ui.toolButtonActive)}
        >
          <WandSparkles className="h-4 w-4" aria-hidden />
          <span className="hidden md:inline">Copiloto</span>
          {copilotAttention ? (
            <span aria-hidden className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-flow-menu", copilotAttention === "failed" ? "bg-flow-danger" : "bg-flow-accent")} />
          ) : null}
        </button>
        <span aria-hidden className={cn(ui.divider, "hidden sm:block")} />
        <button type="button" onClick={onOpenBot} aria-label="Abrir prévia" title="Abrir prévia" className={cn(ui.toolButton, botOpen && ui.toolButtonActive)}>
          <Bot className="h-4 w-4" aria-hidden />
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          {ERA_VISIBLE ? (
            <button
              type="button"
              onClick={onOpenEra}
              aria-haspopup="dialog"
              aria-label="Converter para o padrão ERA"
              title="Converter para o padrão ERA"
              className={ui.toolButton}
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <BackgroundMenu hasImage={hasBackground} capturing={capturing} onChange={onChangeBackground} onSave={onSaveImage} onReset={onResetBackground} />
          <button
            type="button"
            onClick={() => setShowColorPanel(!showColorPanel)}
            onPointerEnter={warmColors}
            onFocus={warmColors}
            data-color-panel-trigger=""
            aria-expanded={showColorPanel}
            aria-label="Cores"
            title="Cores"
            className={cn(ui.toolButton, showColorPanel && ui.toolButtonActive)}
          >
            <Palette className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema" className={ui.toolButton}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <MoreMenu
          theme={theme}
          hasImage={hasBackground}
          capturing={capturing}
          onOpenEra={onOpenEra}
          onChangeBackground={onChangeBackground}
          onSaveImage={onSaveImage}
          onResetBackground={onResetBackground}
          onOpenColors={() => setShowColorPanel(true)}
          onToggleTheme={toggleTheme}
        />
      </div>
    </header>
  )
}

function BackgroundForm({ initial, onCancel, onApply }: { initial: string; onCancel: () => void; onApply: (url: string) => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)
  const activeRef = useRef(true)
  const inputId = useId()
  const messageId = useId()

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = imageUrlFrom(value)
    if (!url) {
      setError("Informe um endereço de imagem válido, começando com http:// ou https://.")
      return
    }
    setError("")
    setChecking(true)
    try {
      await loadImage(url)
      if (activeRef.current) onApply(url)
    } catch {
      if (activeRef.current) setError("Não foi possível carregar uma imagem neste endereço.")
    } finally {
      if (activeRef.current) setChecking(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <DialogHeader className="space-y-1 text-left">
        <DialogTitle className="text-base font-semibold text-flow-fg">Trocar imagem de fundo</DialogTitle>
        <DialogDescription className="text-sm text-flow-muted">A imagem aparece atrás do canvas e fica salva neste navegador.</DialogDescription>
      </DialogHeader>
      <div>
        <label htmlFor={inputId} className={ui.label}>
          Endereço da imagem
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={value}
          placeholder="https://exemplo.com/fundo.jpg"
          aria-invalid={Boolean(error)}
          aria-describedby={messageId}
          onChange={(event) => {
            setValue(event.target.value)
            setError("")
          }}
          className={cn(ui.input, error && "border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25")}
        />
        {error ? (
          <p id={messageId} role="alert" className={ui.error}>
            {error}
          </p>
        ) : (
          <p id={messageId} className={ui.hint}>
            Use um link http ou https que aponte direto para o arquivo da imagem.
          </p>
        )}
      </div>
      <DialogFooter className="gap-2 sm:space-x-0">
        <button type="button" onClick={onCancel} className={ui.button}>
          Cancelar
        </button>
        <button type="submit" disabled={checking || !value.trim()} className={ui.primaryButton}>
          {checking && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
          {checking ? "Carregando" : "Aplicar"}
        </button>
      </DialogFooter>
    </form>
  )
}

function YenFlowBot({ isOpen, openRequest, offset, onClose, onStart }: { isOpen: boolean; openRequest: number; offset: number; onClose: () => void; onStart: () => void }) {
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [input, setInput] = useState("")
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [savedFlow, setSavedFlow] = useState<AtendimentoFlow | null>(null)
  const [isFlowExecuted, setIsFlowExecuted] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const focusPending = useRef(false)
  const previewRef = useRef<PreviewState>(emptyPreview())
  const signatureRef = useRef<string | null>(null)
  const messageCounter = useRef(0)

  const nextMessageId = useCallback(() => `message-${++messageCounter.current}`, [])

  const resetConversation = useCallback(
    (flow: AtendimentoFlow | null) => {
      setSavedFlow(flow)
      setIsFlowExecuted(Boolean(flow))
      previewRef.current = emptyPreview()
      signatureRef.current = flow ? behaviorSignature(flow) : null
      setMessages([{ id: nextMessageId(), role: "assistant", content: flow ? READY_MESSAGE : IDLE_MESSAGE }])
    },
    [nextMessageId],
  )

  useEffect(() => {
    if (isOpen) resetConversation(loadExecutedFlow())
  }, [isOpen, resetConversation])

  useEffect(() => {
    const handleExecuted = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      resetConversation((detail ? parseFlow(detail) : null) ?? loadExecutedFlow())
    }
    const handleStorageChange = () => {
      if (!isOpen) return
      const flow = loadExecutedFlow()
      if (!flow) {
        if (signatureRef.current === null) return
        signatureRef.current = null
        setIsFlowExecuted(false)
        previewRef.current = emptyPreview()
        const notice: BotMessage = { id: nextMessageId(), role: "assistant", content: CHANGED_MESSAGE }
        setMessages((previous) => [...previous, notice])
        return
      }
      if (behaviorSignature(flow) !== signatureRef.current) resetConversation(flow)
    }
    window.addEventListener("workflow:executed", handleExecuted)
    window.addEventListener("storage", handleStorageChange)
    return () => {
      window.removeEventListener("workflow:executed", handleExecuted)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [isOpen, nextMessageId, resetConversation])

  useEffect(() => {
    if (!isOpen) return
    focusPending.current = true
    setIsMinimized(false)
  }, [isOpen, openRequest])

  useEffect(() => {
    if (!focusPending.current || !inputRef.current) return
    focusPending.current = false
    inputRef.current.focus({ preventScroll: true })
  })

  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    log.scrollTo({ top: log.scrollHeight, behavior: reduced ? "auto" : "smooth" })
  }, [messages, isMinimized, isOpen])

  const clampPosition = useCallback((next: { x: number; y: number }) => {
    const panel = panelRef.current
    if (!panel) return next
    const maxX = Math.max(0, window.innerWidth - offset - panel.offsetWidth - BOT_GAP * 2)
    const maxY = Math.max(0, window.innerHeight - panel.offsetHeight - BOT_GAP * 2 - HEADER_HEIGHT)
    return { x: Math.min(Math.max(next.x, 0), maxX), y: Math.min(Math.max(next.y, 0), maxY) }
  }, [offset])

  useEffect(() => {
    if (!isOpen) return
    const keepInside = () =>
      setPosition((current) => {
        const next = clampPosition(current)
        return next.x === current.x && next.y === current.y ? current : next
      })
    keepInside()
    window.addEventListener("resize", keepInside)
    return () => window.removeEventListener("resize", keepInside)
  }, [isOpen, isMinimized, clampPosition])

  const handleSendMessage = () => {
    const reply = input.trim()
    if (!reply) return
    setInput("")
    const next = savedFlow && isFlowExecuted
      ? (previewRef.current.waiting ? replyPreview(savedFlow, previewRef.current, reply) : startPreview(savedFlow))
      : { ...emptyPreview(), messages: [INACTIVE_REPLY] }
    previewRef.current = next
    const entries: BotMessage[] = [
      { id: nextMessageId(), role: "user", content: reply },
      ...next.messages.map((content) => ({ id: nextMessageId(), role: "assistant" as const, content })),
    ]
    setMessages((previous) => [...previous, ...entries])
  }

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position.x, originY: position.y }
    setIsDragging(true)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition(clampPosition({ x: drag.originX - (event.clientX - drag.x), y: drag.originY - (event.clientY - drag.y) }))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (!isOpen) return null

  return (
    <section
      ref={panelRef}
      aria-label="Assistente de prévia"
      className={cn(ui.card, "fixed z-50 flex w-96 max-w-[calc(100vw_-_2rem)] flex-col overflow-hidden shadow-xl duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none")}
      style={{ right: BOT_GAP + offset + position.x, bottom: BOT_GAP + position.y }}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn("flex touch-none select-none items-center justify-between gap-2 border-b border-flow-border px-3 py-2.5", isDragging ? "cursor-grabbing" : "cursor-grab", isMinimized && "border-b-0")}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flow-soft text-flow-accent">
            <Bot className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-flow-fg">¥$</h2>
            <p className="truncate text-[11px] text-flow-muted">Assistente by Lucas Lima</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized((current) => !current)}
            aria-label={isMinimized ? "Expandir prévia" : "Minimizar prévia"}
            title={isMinimized ? "Expandir prévia" : "Minimizar prévia"}
            className={ghostButton}
          >
            {isMinimized ? <Maximize2 className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar prévia" title="Fechar prévia" className={ghostButton}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {!isMinimized && (
        <>
          <div ref={logRef} role="log" aria-label="Prévia do atendimento" aria-live="polite" className="flex h-[min(20rem,calc(100dvh_-_16rem))] flex-col gap-2 overflow-y-auto px-3 py-3">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    message.role === "user" ? "rounded-br-md bg-flow-accent-strong text-white" : "rounded-bl-md border border-flow-border bg-flow-soft text-flow-fg",
                  )}
                >
                  {message.content}
                </p>
              </div>
            ))}
          </div>
          {!isFlowExecuted && (
            <div className="flex items-center justify-between gap-2 border-t border-flow-border bg-flow-soft px-3 py-2">
              <span className="text-xs text-flow-muted">Prévia inativa</span>
              <button type="button" onClick={onStart} className={ui.accentButton}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Iniciar prévia
              </button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleSendMessage()
            }}
            className="flex items-center gap-2 border-t border-flow-border p-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua mensagem..."
              aria-label="Mensagem para a prévia"
              autoComplete="off"
              className={cn(ui.input, "min-w-0 flex-1")}
            />
            <button type="submit" disabled={!input.trim()} aria-label="Enviar mensagem" title="Enviar mensagem" className={cn(ui.primaryButton, "h-9 w-9 justify-center px-0")}>
              <SendHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </>
      )}
    </section>
  )
}

function LoadingScreen() {
  return (
    <div role="status" className="flex h-dvh flex-col items-center justify-center gap-3 bg-flow-bg">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-flow-accent text-white">
        <Workflow className="h-5 w-5" aria-hidden />
      </span>
      <p className="flex items-center gap-2 text-sm text-flow-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Carregando editor
      </p>
    </div>
  )
}

function FlowLayout() {
  const { showColorPanel } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [botOpen, setBotOpen] = useState(false)
  const [botRequest, setBotRequest] = useState(0)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoaded, setAiLoaded] = useState(false)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotLoaded, setCopilotLoaded] = useState(false)
  const [copilotAttention, setCopilotAttention] = useState<CopilotAttention | null>(null)
  const [eraOpen, setEraOpen] = useState(false)
  const settingsDialog = useAiSettingsDialog()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  useEffect(() => {
    if (settingsDialog.open) setSettingsLoaded(true)
  }, [settingsDialog.open])
  const [backgroundDialog, setBackgroundDialog] = useState(false)
  const [background, setBackground] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const actionsRef = useRef<WorkflowActions | null>(null)
  const containerRef = useRef<HTMLElement>(null)
  const capturingRef = useRef(false)
  const copilotId = useId()
  const wide = useMediaQuery(WIDE_QUERY)
  const canvasRoom = useMediaQuery(CANVAS_PICK_QUERY)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BACKGROUND_KEY)
      const url = saved ? imageUrlFrom(saved) : null
      if (url) {
        setBackgroundVariable(url)
        setBackground(url)
      }
    } catch {}
    setMounted(true)
  }, [])

  const handleActionsReady = useCallback((actions: WorkflowActions) => {
    actionsRef.current = actions
  }, [])

  const openBot = useCallback(() => {
    setBotOpen(true)
    setBotRequest((count) => count + 1)
  }, [])

  const closeBot = useCallback(() => setBotOpen(false), [])

  const runPreview = useCallback(() => {
    actionsRef.current?.execute()
  }, [])

  const searchComponent = useCallback((query: string) => {
    actionsRef.current?.search(query)
  }, [])

  const openAI = useCallback(() => {
    setCopilotOpen(false)
    setAiLoaded(true)
    setAiOpen(true)
  }, [])

  const changeAiOpen = useCallback((open: boolean) => {
    if (open) setCopilotOpen(false)
    setAiOpen(open)
  }, [])

  const toggleCopilot = useCallback(() => {
    setCopilotLoaded(true)
    setCopilotOpen((open) => !open)
  }, [])

  const closeCopilot = useCallback(() => setCopilotOpen(false), [])

  const openEra = useCallback(() => setEraOpen(true), [])

  const handleGenerated = useCallback((workflow: unknown) => {
    const actions = actionsRef.current
    if (actions) return actions.loadWorkflow(workflow)
    toast({ title: "Editor indisponível", description: "Aguarde o editor terminar de carregar e tente novamente.", variant: "destructive" })
    return false
  }, [])

  const handleLivePreview = useCallback((flow: AtendimentoFlow | null, done?: boolean, kind?: PreviewKind, fresh?: boolean, focus?: string | null) => {
    actionsRef.current?.previewWorkflow(flow, done, kind, fresh, focus)
  }, [])

  const getCurrentFlow = useCallback(() => actionsRef.current?.getFlow() ?? null, [])

  const handleEdited = useCallback((workflow: AtendimentoFlow) => {
    const actions = actionsRef.current
    if (actions) return actions.applyWorkflowEdit(workflow)
    toast({ title: "Editor indisponível", description: "Aguarde o editor terminar de carregar e tente novamente.", variant: "destructive" })
    return false
  }, [])

  const livePreview = useMemo<LivePreviewProps>(
    () => ({ onLivePreview: handleLivePreview, getCurrentFlow, onWorkflowEdited: handleEdited }),
    [getCurrentFlow, handleEdited, handleLivePreview],
  )

  const canvasPick = useMemo<CanvasPick>(
    () => ({
      start: (request) => actionsRef.current?.startPick(request) ?? [],
      select: (id) => actionsRef.current?.selectPick(id),
      confirm: () => actionsRef.current?.confirmPick(),
      end: () => actionsRef.current?.endPick(),
    }),
    [],
  )

  const openBackgroundDialog = useCallback(() => setBackgroundDialog(true), [])

  const closeBackgroundDialog = useCallback(() => setBackgroundDialog(false), [])

  const applyBackground = useCallback((url: string) => {
    setBackgroundVariable(url)
    setBackground(url)
    setBackgroundDialog(false)
    try {
      localStorage.setItem(BACKGROUND_KEY, url)
      toast({ title: "Imagem de fundo aplicada" })
    } catch {
      toast({ title: "Imagem aplicada só nesta sessão", description: "O navegador não permitiu guardar a imagem de fundo." })
    }
  }, [])

  const resetBackground = useCallback(() => {
    setBackgroundVariable(null)
    setBackground(null)
    try {
      localStorage.removeItem(BACKGROUND_KEY)
    } catch {}
    toast({ title: "Fundo padrão restaurado" })
  }, [])

  const saveCanvasImage = useCallback(async () => {
    const actions = actionsRef.current
    if (!actions || capturingRef.current) return
    capturingRef.current = true
    setCapturing(true)
    try {
      const blob = await actions.captureImage()
      if (!blob) throw new Error("blob")
      const fileName = exportFileName({ name: storedFlowName(), created_at: new Date().toISOString() })
        .replace(/\.json$/, ".png")
        .replace(/[<>:"/\\|?*]/g, "-")
      downloadBlob(blob, fileName)
      toast({ title: "Imagem do canvas salva", description: fileName })
    } catch {
      toast({ title: "Não foi possível salvar a imagem", description: "O navegador não conseguiu gerar o PNG do canvas. Tente novamente.", variant: "destructive" })
    } finally {
      capturingRef.current = false
      setCapturing(false)
    }
  }, [])

  const builder = useMemo(() => <WorkflowBuilder onActionsReady={handleActionsReady} onOpenBot={openBot} />, [handleActionsReady, openBot])

  if (!mounted) return <LoadingScreen />

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-flow-bg text-flow-fg">
      <FlowHeader
        botOpen={botOpen}
        capturing={capturing}
        hasBackground={Boolean(background)}
        copilotId={copilotId}
        copilotOpen={copilotOpen}
        copilotMounted={copilotLoaded}
        copilotAttention={copilotAttention}
        onSearch={searchComponent}
        onOpenAI={openAI}
        onToggleCopilot={toggleCopilot}
        onOpenBot={openBot}
        onOpenEra={openEra}
        onChangeBackground={openBackgroundDialog}
        onSaveImage={saveCanvasImage}
        onResetBackground={resetBackground}
      />
      <div className="relative flex min-h-0 flex-1">
        <main ref={containerRef} className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-flow-bg">
          {builder}
        </main>
        {copilotLoaded && (
          <AICopilot
            id={copilotId}
            open={copilotOpen}
            onClose={closeCopilot}
            getCurrentFlow={getCurrentFlow}
            onLivePreview={handleLivePreview}
            onWorkflowEdited={handleEdited}
            dialogBusy={dialogBusy}
            onAttentionChange={setCopilotAttention}
            pick={canvasRoom ? canvasPick : undefined}
          />
        )}
      </div>
      <YenFlowBot isOpen={botOpen} openRequest={botRequest} offset={copilotOpen && wide ? COPILOT_WIDTH : 0} onClose={closeBot} onStart={runPreview} />
      {aiLoaded && <AIWorkflowDialog open={aiOpen} onOpenChange={changeAiOpen} onWorkflowGenerated={handleGenerated} onBusyChange={setDialogBusy} {...livePreview} />}
      {ERA_VISIBLE ? <EraDialog open={eraOpen} onOpenChange={setEraOpen} /> : null}
      {settingsLoaded ? <AiSettingsDialog /> : null}
      {showColorPanel && <ColorPanel />}
      <Dialog open={backgroundDialog} onOpenChange={setBackgroundDialog}>
        <DialogContent className={cn(ui.dialog, "max-w-md rounded-xl sm:rounded-xl")}>
          <BackgroundForm initial={background && !background.startsWith("data:") ? background : ""} onCancel={closeBackgroundDialog} onApply={applyBackground} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FlowLayout
