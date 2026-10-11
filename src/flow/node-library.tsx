"use client"

import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react"
import { Info, Search, SearchX, X } from "lucide-react"
import { START_TYPE, categories, componentCatalog } from "@/lib/atendimento/catalog"
import type { ComponentDefinition } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { componentIcon } from "./nodes/atendimento-node"
import { ui } from "./ui"

const DRAG_TYPE = "application/reactflow"
const MAIN_CATEGORIES: readonly string[] = ["messages", "routing", "conditions", "control"]
const UNAVAILABLE = "Requer um JSON exportado da plataforma"
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722]
const MIN_CONTRAST = 4.5

const tabs = [
  { id: "main", label: "Principais" },
  { id: "templates", label: "Templates" },
  { id: "collection", label: "Coleta" },
  { id: "apis", label: "APIs" },
  { id: "ai", label: "IA" },
  { id: "tickets", label: "Tickets" },
  { id: "crm", label: "CRM" },
  { id: "schedule", label: "Agenda" },
  { id: "livechat", label: "Livechat" },
  { id: "all", label: "Todas" },
] as const

type TabId = (typeof tabs)[number]["id"]

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

const keepCompoundWords = (label: string) => label.replace(/([-/])(?=\S)/g, "$1\u2060")

const luminance = (rgb: number[]) =>
  rgb.reduce((sum, channel, index) => {
    const value = channel / 255
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return sum + LUMINANCE_WEIGHTS[index] * linear
  }, 0)

const readableTone = (hex: string) => {
  let rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
  while (1.05 / (luminance(rgb) + 0.05) < MIN_CONTRAST) rgb = rgb.map((channel) => Math.floor(channel * 0.97))
  return `rgb(${rgb.join(" ")})`
}

const library = categories
  .map((category) => ({
    category,
    tone: readableTone(category.color),
    items: componentCatalog
      .filter((entry) => entry.category === category.id && entry.nativeType !== START_TYPE)
      .map((entry) => ({
        entry,
        display: keepCompoundWords(entry.label),
        text: normalize([entry.label, category.label, entry.nativeType ?? ""].join(" ")),
      })),
  }))
  .filter((group) => group.items.length > 0)

const inTab = (tab: TabId, category: string) =>
  tab === "all" || (tab === "main" ? MAIN_CATEGORIES.includes(category) : tab === category)

const resultMessage = (count: number) =>
  count === 0 ? "Nenhum resultado" : count === 1 ? "1 componente encontrado" : `${count} componentes encontrados`

const tile =
  "flex h-11 w-full select-none items-center gap-1.5 rounded-lg border px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent focus-visible:ring-offset-2 focus-visible:ring-offset-flow-menu"
const tileReady = "cursor-grab border-transparent text-white shadow-sm hover:brightness-110 active:cursor-grabbing"
const tilePending =
  "cursor-help border-dashed border-flow-border bg-flow-soft text-flow-muted hover:border-flow-muted/50 hover:text-flow-muted-strong"
const tilePendingActive = "cursor-help border-dashed border-flow-warning/70 bg-flow-warning/10 text-flow-fg"
const tileLabel = "line-clamp-2 min-w-0 flex-1 text-balance text-[11px] font-semibold leading-tight"
const filterButton =
  "h-6 rounded-md px-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/40"

function NodeLibrary({ onAdd }: { onAdd: (type: string) => void }) {
  const baseId = useId()
  const unavailableId = `${baseId}-unavailable`
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<TabId>("main")
  const [pending, setPending] = useState<ComponentDefinition | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<HTMLButtonElement | null>(null)

  const terms = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query])
  const searching = terms.length > 0
  const groups = useMemo(
    () =>
      library
        .map((group) => ({
          ...group,
          items: searching
            ? group.items.filter((item) => terms.every((term) => item.text.includes(term)))
            : inTab(tab, group.category.id)
              ? group.items
              : [],
        }))
        .filter((group) => group.items.length > 0),
    [searching, tab, terms],
  )
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  useLayoutEffect(() => {
    const list = listRef.current
    const origin = originRef.current
    if (!pending || !list || !origin?.isConnected) return
    const hidden = origin.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 8
    if (hidden > 0) list.scrollTop += hidden
  }, [pending])

  const changeQuery = (value: string) => {
    setQuery(value)
    listRef.current?.scrollTo({ top: 0 })
  }

  const selectTab = (id: TabId) => {
    setTab(id)
    changeQuery("")
  }

  const clearQuery = () => {
    changeQuery("")
    searchRef.current?.focus()
  }

  const dismiss = (restoreFocus: boolean) => {
    const origin = originRef.current
    originRef.current = null
    setPending(null)
    if (!restoreFocus) return
    if (origin?.isConnected) origin.focus()
    else searchRef.current?.focus()
  }

  const choose = (event: MouseEvent<HTMLButtonElement>, entry: ComponentDefinition) => {
    if (entry.nativeType) {
      originRef.current = null
      setPending(null)
      onAdd(entry.nativeType)
      return
    }
    originRef.current = event.currentTarget
    setPending(entry)
  }

  const startDrag = (event: DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData(DRAG_TYPE, type)
    event.dataTransfer.effectAllowed = "copyMove"
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !pending) return
    event.stopPropagation()
    dismiss(Boolean(noticeRef.current?.contains(document.activeElement)))
  }

  return (
    <aside
      aria-label="Biblioteca de componentes"
      onKeyDown={handleKeyDown}
      className={cn("flex h-full min-h-0 w-72 shrink-0 flex-col border-r", ui.panel)}
    >
      <div className="shrink-0 border-b border-flow-border px-3 pb-3 pt-3">
        <h2 className="px-0.5 text-sm font-semibold text-flow-fg">Componentes</h2>
        <div className="relative mt-2.5">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-flow-muted"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !query) return
              event.stopPropagation()
              changeQuery("")
            }}
            placeholder="Pesquisar componentes"
            aria-label="Pesquisar componentes"
            autoComplete="off"
            spellCheck={false}
            className={cn(ui.input, "h-8 pl-8 pr-8 text-xs [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Limpar busca"
              title="Limpar busca"
              className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {searching ? resultMessage(total) : ""}
        </p>
        <span id={unavailableId} hidden>
          {UNAVAILABLE}
        </span>
        <div role="group" aria-label="Categorias" className="mt-2.5 flex flex-wrap justify-between gap-x-0.5 gap-y-1">
          {tabs.map((item) => {
            const active = !searching && tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(item.id)}
                className={cn(
                  filterButton,
                  active
                    ? "bg-flow-accent/15 text-flow-fg ring-1 ring-inset ring-flow-accent/60"
                    : "text-flow-muted hover:bg-flow-strong hover:text-flow-fg",
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto pb-3 pl-3 pr-1.5 pt-3 [scrollbar-gutter:stable]"
      >
        {groups.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const headingId = `${baseId}-${group.category.id}`
              return (
                <section key={group.category.id}>
                  <h3 id={headingId} className={cn(ui.sectionTitle, "flex items-center gap-1.5 px-0.5 pb-2")}>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: group.category.color }}
                      aria-hidden
                    />
                    {group.category.label}
                  </h3>
                  <ul aria-labelledby={headingId} className="grid grid-cols-2 gap-1.5">
                    {group.items.map(({ entry, display }) => {
                      const type = entry.nativeType
                      if (type) {
                        const Icon = componentIcon(type)
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              aria-label={entry.label}
                              title={entry.label}
                              draggable
                              onDragStart={(event) => startDrag(event, type)}
                              onClick={(event) => choose(event, entry)}
                              className={cn(tile, tileReady)}
                              style={{ backgroundColor: group.tone }}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className={tileLabel}>{display}</span>
                            </button>
                          </li>
                        )
                      }
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            aria-label={entry.label}
                            aria-describedby={unavailableId}
                            title={`${entry.label}\n${UNAVAILABLE}`}
                            onClick={(event) => choose(event, entry)}
                            className={cn(tile, pending?.id === entry.id ? tilePendingActive : tilePending)}
                          >
                            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: group.category.color }}
                              />
                            </span>
                            <span className={cn(tileLabel, "font-medium")}>{display}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-flow-border bg-flow-soft px-3 py-5 text-center">
            <SearchX className="mx-auto h-5 w-5 text-flow-muted" aria-hidden />
            <p className="mt-2 text-xs font-semibold text-flow-fg">Nenhum componente encontrado</p>
            <p className="mt-1 break-words text-[11px] leading-4 text-flow-muted">
              Nada corresponde a “{query.trim()}”. Revise o termo ou escolha uma categoria.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-flow-border px-3 py-2">
        <div ref={noticeRef} role="status">
          {pending ? (
            <div className="rounded-lg border border-flow-warning/40 bg-flow-warning/10 py-2 pl-2.5 pr-2">
              <div className="flex items-start gap-1.5">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-flow-warning" aria-hidden />
                <p className="min-w-0 flex-1 text-balance text-xs font-semibold leading-4 text-flow-fg">{pending.label}</p>
                <button
                  type="button"
                  onClick={(event) => dismiss(event.detail === 0)}
                  className={cn(ui.button, "-my-1 h-6 px-2 text-[11px]")}
                >
                  Entendi
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-flow-muted-strong">
                Envie um JSON exportado da plataforma com este componente configurado para habilitá-lo.
              </p>
            </div>
          ) : null}
        </div>
        {pending ? null : <p className="text-center text-[11px] leading-4 text-flow-muted">Clique ou arraste para adicionar</p>}
      </div>
    </aside>
  )
}

export default memo(NodeLibrary)
