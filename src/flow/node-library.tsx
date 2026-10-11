"use client"

import { memo, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react"
import { Info, Search, SearchX, X } from "lucide-react"
import { START_TYPE, categories, componentCatalog } from "@/lib/atendimento/catalog"
import type { ComponentDefinition } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { componentIcon } from "./nodes/atendimento-node"
import { ui } from "./ui"

const DRAG_TYPE = "application/reactflow"
const MAIN_CATEGORIES: readonly string[] = ["messages", "routing", "conditions", "control"]

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

const VOWEL = /[aeiouáàâãéêíóôõúü]/
const ONSETS = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tl", "tr", "vr", "ch", "lh", "nh"])

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

function hyphenateWord(word: string) {
  if (word.length < 11 || !/^[a-zà-ÿ]+$/i.test(word)) return word
  const lower = word.toLowerCase()
  const isVowel = (index: number) =>
    VOWEL.test(lower[index]) &&
    !(lower[index] === "u" && /[qg]/.test(lower[index - 1] ?? "") && VOWEL.test(lower[index + 1] ?? ""))
  const cuts: number[] = []
  let previous = -1
  for (let index = 0; index < lower.length; index++) {
    if (!isVowel(index)) continue
    if (previous >= 0 && index - previous > 1) {
      cuts.push(index - previous > 2 && ONSETS.has(lower.slice(index - 2, index)) ? index - 2 : index - 1)
    }
    previous = index
  }
  return cuts
    .filter((cut) => cut >= 2 && word.length - cut >= 3)
    .reduceRight((text, cut) => `${text.slice(0, cut)}\u00ad${text.slice(cut)}`, word)
}

const library = categories
  .map((category) => ({
    category,
    items: componentCatalog
      .filter((entry) => entry.category === category.id && entry.nativeType !== START_TYPE)
      .map((entry) => ({
        entry,
        display: entry.label.split(" ").map(hyphenateWord).join(" "),
        text: normalize([entry.label, category.label, entry.nativeType ?? ""].join(" ")),
      })),
  }))
  .filter((group) => group.items.length > 0)

const inTab = (tab: TabId, category: string) =>
  tab === "all" || (tab === "main" ? MAIN_CATEGORIES.includes(category) : tab === category)

const resultMessage = (count: number) =>
  count === 0 ? "Nenhum resultado" : count === 1 ? "1 componente encontrado" : `${count} componentes encontrados`

const tileBase =
  "flex min-h-[3.25rem] w-full select-none flex-col items-center justify-center gap-1 overflow-hidden rounded-lg px-1 py-1.5 text-center text-[10px] font-semibold leading-[1.15] text-white shadow-sm transition focus-visible:ring-2 focus-visible:ring-flow-accent focus-visible:ring-offset-2 focus-visible:ring-offset-flow-menu"
const tileReady = "cursor-grab hover:brightness-110 active:cursor-grabbing focus-visible:outline-none"
const tilePending =
  "cursor-help opacity-50 outline-dashed outline-1 outline-offset-[-4px] outline-white/80 hover:opacity-75 focus-visible:opacity-75"

function NodeLibrary({ onAdd }: { onAdd: (type: string) => void }) {
  const baseId = useId()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<TabId>("main")
  const [pending, setPending] = useState<string | null>(null)
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
    setPending(entry.label)
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
      className={cn("flex h-full min-h-0 w-64 shrink-0 flex-col border-r", ui.panel)}
    >
      <div className="shrink-0 px-3 pb-2 pt-3">
        <h2 className="px-1 text-sm font-bold text-flow-fg">Componentes</h2>
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
            className={cn(ui.input, "h-9 pl-8 pr-8 text-xs [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Limpar busca"
              title="Limpar busca"
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {searching ? resultMessage(total) : ""}
        </p>
        <div role="group" aria-label="Categorias" className="mt-2.5 flex flex-wrap gap-1">
          {tabs.map((item) => {
            const active = !searching && tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(item.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
                  active
                    ? "border-flow-accent bg-flow-accent text-white shadow-sm"
                    : "border-flow-border bg-flow-surface text-flow-muted-strong hover:border-flow-accent/50 hover:text-flow-fg",
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {groups.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groups.map((group) => {
              const headingId = `${baseId}-${group.category.id}`
              return (
                <section key={group.category.id}>
                  <h3 id={headingId} className={cn(ui.sectionTitle, "px-1 pb-1.5")}>
                    {group.category.label}
                  </h3>
                  <ul aria-labelledby={headingId} className="grid grid-cols-3 gap-1.5">
                    {group.items.map(({ entry, display }) => {
                      const type = entry.nativeType
                      const Icon = componentIcon(type ?? "")
                      return (
                        <li key={entry.id} className="flex">
                          <button
                            type="button"
                            aria-label={entry.label}
                            draggable={Boolean(type)}
                            onDragStart={type ? (event) => startDrag(event, type) : undefined}
                            onClick={(event) => choose(event, entry)}
                            title={type ? undefined : "Requer um JSON exportado da plataforma"}
                            className={cn(tileBase, type ? tileReady : tilePending)}
                            style={{ backgroundColor: group.category.color }}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="max-w-full hyphens-auto break-words">{display}</span>
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
          <div className="mx-1 mt-2 rounded-xl border border-dashed border-flow-border bg-flow-surface px-3 py-6 text-center">
            <SearchX className="mx-auto h-5 w-5 text-flow-muted" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-flow-fg">Nenhum componente encontrado</p>
            <p className="mt-1 break-words text-xs leading-5 text-flow-muted">
              Nada corresponde a “{query.trim()}”. Revise o termo ou escolha uma categoria.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-flow-border px-3 py-2">
        <div ref={noticeRef} role="status">
          {pending ? (
            <div className="mb-2 rounded-lg border border-flow-warning/40 bg-flow-warning/10 p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-px h-4 w-4 shrink-0 text-flow-warning" aria-hidden />
                <div className="min-w-0">
                  <p className="break-words text-xs font-semibold text-flow-fg">{pending}</p>
                  <p className="mt-1 text-[11px] leading-4 text-flow-muted-strong">
                    Ainda não há um exemplo deste componente no formato de Atendimento. Envie um JSON exportado da
                    plataforma com este componente configurado para habilitá-lo.
                  </p>
                  <button
                    type="button"
                    onClick={(event) => dismiss(event.detail === 0)}
                    className={cn(ui.button, "mt-2 h-7")}
                  >
                    Entendi
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-center text-[11px] text-flow-muted">Clique ou arraste para adicionar</p>
      </div>
    </aside>
  )
}

export default memo(NodeLibrary)
