"use client"

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { useStore, type ReactFlowState } from "reactflow"
import { AlertTriangle, ChevronRight, Copy, Plus, Trash2, X } from "lucide-react"
import { API_TYPES, MENU_TYPE, NOTE_TYPE, START_TYPE, expectedFieldTypes, getComponentColor, getComponentLabel, getDefinition, mirrorKeys, newTimeRule, weekDayOptions } from "@/lib/atendimento/catalog"
import { isObject, nextOptionDigit, optionIndices } from "@/lib/atendimento/format"
import type { AtendimentoNode, ComponentDefinition, FieldSpec, ItemFieldSpec, JsonObject, JsonValue } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { categoryTint, componentIcon, noteColor } from "./nodes/atendimento-node"
import { ui } from "./ui"

type Edge = "none" | "top" | "bottom" | "both"
type OutputChange = { kind: "insert" | "remove"; index: number }
type MenuEntry = { id: string; title: string }

interface NumberRule {
  integer: boolean
  min?: number
  max?: number
  step?: number
}

interface WriteOptions {
  complete?: boolean
  change?: OutputChange
}

const technicalLabels: Record<string, string> = {
  message: "Mensagem adicional",
  "df-channel": "Canal",
  id: "ID de referência",
  userManager: "Responsável",
  customfields: "Campo legado",
  curl: "cURL de referência",
  parsed_body: "Parâmetros do corpo",
  parameterExplanations: "Descrição dos parâmetros",
  isApiValidated: "API validada na plataforma",
  validated_signature: "Assinatura da validação",
  title: "Título",
  buttons: "Botões",
}

const dayNames: Record<string, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
}

const API_KEYS = ["url_api", "method", "body_value", "headers"]
const OPTION_KEY = /^(opt|text|description)-(\d+)$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_OPTIONS = 10
const MENU_PREVIEW = 48
const TEXT_LIMITS: Record<string, number> = { "envio_mensagem.title": 1024 }
const MONOSPACE_KEYS = new Set(["body_value"])
const OPTION_FIELDS = [["opt", "Número"], ["text", "Título"], ["description", "Descrição"]] as const
const COMPLETED_TYPES: ReadonlySet<string> = new Set(["departamentos", "flow", "voltar", "tabulation"])
const ORDERED_TYPES: ReadonlySet<string> = new Set(["solicitar_dados", "consulta_api", "condicional_api"])
const TEXT_LIST_NOUNS: Record<string, string> = { selectedIds: "ID" }
const MIRROR_FALLBACK: ReadonlySet<string> = new Set(["envio_imagem.imagem"])
const FILE_NAME_SOURCES: Record<string, string[]> = { envio_arquivo: ["url"], envio_imagem: ["imagem", "url"] }
const CARD_KINDS: ReadonlySet<string> = new Set(["menuOptions", "conditionPairs", "weightedPaths", "objectList"])

const iconButton =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
const iconDangerButton =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-danger/10 hover:text-flow-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-danger/30 disabled:pointer-events-none disabled:opacity-40"
const addButton =
  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-flow-border bg-flow-surface text-xs font-semibold text-flow-muted-strong transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"
const invalidField = "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"
const toggleRow = "flex items-center gap-2.5 rounded-lg border border-flow-border bg-flow-surface px-3 transition hover:border-flow-accent/50"
const toggleLabel = "min-w-0 flex-1 cursor-pointer break-words py-2.5 text-sm text-flow-fg"
const checkbox = "h-4 w-4 shrink-0 cursor-pointer accent-flow-accent"
const note = "rounded-lg border border-flow-border bg-flow-soft px-3 py-2.5 text-xs leading-5 text-flow-muted-strong"
const collapsible = "group border-t border-flow-border pt-4"
const summary =
  "flex cursor-pointer select-none list-none items-center gap-2 rounded-md py-1 text-xs font-semibold text-flow-muted-strong transition hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 [&::-webkit-details-marker]:hidden"
const chevron = "h-3.5 w-3.5 shrink-0 text-flow-muted transition-transform group-open:rotate-90"
const keyTag = "max-w-[45%] shrink-0 truncate font-mono text-[10px] text-flow-muted"
const outputTag = "ml-auto font-mono text-[10px] text-flow-muted"
const emptyNote = "text-[11px] leading-4 text-flow-muted"
const limitNote = "text-[11px] font-medium text-flow-warning"
const edgeClass: Record<Edge, string> = {
  none: "",
  top: "border-t border-flow-border pt-4",
  bottom: "border-b border-flow-border pb-4",
  both: "border-y border-flow-border py-4",
}

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const isRecord = (value: JsonValue | undefined): value is JsonObject => isObject(value)
const copyJson = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const textOf = (value: JsonValue | undefined) => typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : ""
const structured = (value: JsonValue | undefined): value is JsonObject | JsonValue[] => value !== null && typeof value === "object"
const lowerFirst = (text: string) => /^[A-ZÀ-Ý][a-zà-ÿ]/.test(text) ? `${text.charAt(0).toLocaleLowerCase("pt-BR")}${text.slice(1)}` : text
const feminine = (noun: string) => /(a|ão)$/i.test(noun)
const plural = (noun: string) => noun.endsWith("ão") ? `${noun.slice(0, -2)}ões` : noun.endsWith("m") ? `${noun.slice(0, -1)}ns` : /[rsz]$/.test(noun) ? `${noun}es` : `${noun}s`
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const describe = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined
const hintOf = (id: string) => `${id}-hint`
const focusSoon = (id: string) => window.requestAnimationFrame(() => document.getElementById(id)?.focus())
const focusEnd = (id: string) => window.requestAnimationFrame(() => {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement)) return
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
})

function emptyList(noun: string): string {
  const item = lowerFirst(noun)
  return feminine(item) ? `Nenhuma ${item} cadastrada.` : `Nenhum ${item} cadastrado.`
}

function itemName(label: string, noun: string, position: number): string {
  const item = lowerFirst(noun)
  const of = feminine(item) ? "da" : "do"
  const lower = label.toLocaleLowerCase("pt-BR")
  if (lower.endsWith(` ${of} ${item}`)) return `${label} ${position}`
  if (lower === item) return `Nome ${of} ${item} ${position}`
  if (!label.includes(" ")) return `${label} ${of} ${item} ${position}`
  return `${label}, ${item} ${position}`
}

function numberRule({ min, max, step }: { min?: number; max?: number; step?: number }): NumberRule {
  return { integer: step !== undefined && Number.isInteger(step), min, max, step }
}

function numberMessage({ integer, min, max }: NumberRule): string {
  const kind = integer ? "um número inteiro" : "um número"
  if (min !== undefined && max !== undefined) return `Informe ${kind} de ${min} a ${max}.`
  if (min !== undefined) return `Informe ${kind} a partir de ${min}.`
  if (max !== undefined) return `Informe ${kind} até ${max}.`
  return `Informe ${kind}.`
}

function parseNumber(text: string, { integer, min, max }: NumberRule): number | undefined {
  const trimmed = text.trim().replace(",", ".")
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) return undefined
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) return undefined
  return value
}

function numericText(text: string, rule: NumberRule): boolean {
  return (rule.integer ? /^-?\d+$/ : /^-?\d+([.,]\d+)?$/).test(text) && parseNumber(text, rule) !== undefined
}

function cleanNumberText(text: string, rule: NumberRule): string {
  const kept = text.replace(rule.integer ? /[^\d-]/g : /[^\d.,-]/g, "")
  return rule.min === undefined || rule.min < 0 ? kept.replace(/(?!^)-/g, "") : kept.replace(/-/g, "")
}

function buildCurl(data: JsonObject): string {
  const url = String(data.url_api ?? "")
  const body = String(data.body_value ?? "")
  return `curl -X ${String(data.method || "POST")} '${url}'${body ? ` \\\n  -d '${body}'` : ""}`
}

function mergeChanges(current: JsonObject, edited: JsonObject, base: JsonObject): JsonObject {
  const merged: JsonObject = { ...current }
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    if (!(key in edited)) delete merged[key]
    else if (JSON.stringify(edited[key]) !== JSON.stringify(base[key])) merged[key] = edited[key]
  }
  return merged
}

function knownShape(definition: ComponentDefinition | undefined): JsonObject | undefined {
  return definition?.configured?.() ?? definition?.defaults?.()
}

function completeKeys(before: JsonObject, next: JsonObject, shape: JsonObject): JsonObject {
  const order = Object.keys(shape)
  const keys = Object.keys(before)
  let prefix = 0
  while (prefix < keys.length && prefix < order.length && keys[prefix] === order[prefix]) prefix++
  if (prefix === order.length || keys.slice(prefix).some((key) => order.includes(key))) return next
  const entries: Array<[string, JsonValue]> = []
  for (const key of order) {
    if (has(next, key)) entries.push([key, next[key]])
    else if (!has(before, key)) entries.push([key, copyJson(shape[key])])
  }
  for (const [key, value] of Object.entries(next)) if (!order.includes(key)) entries.push([key, value])
  return Object.fromEntries(entries)
}

function placeKeys(before: JsonObject, next: JsonObject, order: string[]): JsonObject {
  const rank = new Map(order.map((key, index) => [key, index]))
  const keys = Object.keys(next).filter((key) => has(before, key))
  for (const key of Object.keys(next).filter((entry) => !has(before, entry))) {
    const position = rank.get(key)
    const at = position === undefined ? -1 : keys.findIndex((existing) => (rank.get(existing) ?? -1) > position)
    if (at < 0) keys.push(key)
    else keys.splice(at, 0, key)
  }
  return Object.fromEntries(keys.map((key) => [key, next[key]]))
}

function indexedKeys(data: JsonObject, prefix: string): number[] {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`)
  return Object.keys(data).flatMap((key) => {
    const match = pattern.exec(key)
    return match ? [Number(match[1])] : []
  }).sort((a, b) => a - b)
}

function pairPattern(spec: FieldSpec): RegExp | undefined {
  const keys = (spec.itemFields ?? []).map((field) => escapeRegExp(field.key))
  return keys.length ? new RegExp(`^(${keys.join("|")})-(\\d+)$`) : undefined
}

function indexedPattern(spec: FieldSpec): RegExp | undefined {
  if (spec.kind === "menuOptions") return OPTION_KEY
  if (spec.kind === "conditionPairs") return pairPattern(spec)
  return undefined
}

function reindex(data: JsonObject, pattern: RegExp, indices: number[], removed: number): JsonObject {
  const positions = new Map(indices.filter((index) => index !== removed).map((index, position) => [index, position + 1]))
  const entries: Array<[string, JsonValue]> = []
  for (const [key, value] of Object.entries(data)) {
    const match = pattern.exec(key)
    if (!match) {
      entries.push([key, value])
      continue
    }
    const position = positions.get(Number(match[2]))
    if (position !== undefined) entries.push([`${match[1]}-${position}`, value])
  }
  return Object.fromEntries(entries)
}

function initialJson(type: string, key: string): JsonValue {
  const expected = expectedFieldTypes(type, key) ?? []
  return expected.includes("object") && !expected.includes("array") ? {} : []
}

function isStringRecord(value: JsonValue): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string")
}

function newItemOf(spec: FieldSpec): JsonObject {
  if (spec.newItem) return copyJson(spec.newItem)
  return Object.fromEntries((spec.itemFields ?? []).map((field): [string, JsonValue] => [field.key, field.kind === "checkbox" ? false : field.kind === "number" ? Math.max(0, field.min ?? 0) : ""]))
}

function fileNameFrom(address: string | undefined): string {
  if (!address) return ""
  try {
    return new URL(address).pathname.split("/").filter(Boolean).at(-1) ?? ""
  } catch {
    return ""
  }
}

function menuSignature(state: ReactFlowState): string {
  return JSON.stringify(state.getNodes().flatMap((node) => {
    const data: unknown = node.data
    if (!isObject(data) || data.type !== MENU_TYPE) return []
    const fields = isObject(data.data) ? data.data : {}
    return [[node.id, typeof fields.title === "string" ? fields.title : ""]]
  }))
}

function menuLabel({ id, title }: MenuEntry): string {
  const characters = Array.from(title.replace(/\s+/g, " ").trim())
  const text = characters.length > MENU_PREVIEW ? `${characters.slice(0, MENU_PREVIEW - 1).join("").trimEnd()}…` : characters.join("")
  return `${text || "Menu sem mensagem"} (ID ${id})`
}

function Field({ id, label, hint, meta, mono, children }: {
  id: string
  label: string
  hint?: string
  meta?: ReactNode
  mono?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={cn(ui.label, "mb-0 min-w-0 break-words", mono && "font-mono font-medium")}>{label}</label>
        {meta}
      </div>
      {children}
      {hint && <p id={hintOf(id)} className={ui.hint}>{hint}</p>}
    </div>
  )
}

function CharacterCount({ length, limit }: { length: number; limit?: number }) {
  const over = limit !== undefined && length > limit
  return (
    <span className={cn("shrink-0 text-[11px] tabular-nums", over ? "font-semibold text-flow-danger" : "text-flow-muted")}>
      {limit === undefined ? `${length} ${length === 1 ? "caractere" : "caracteres"}` : `${length}/${limit}`}
    </span>
  )
}

function JsonEditor({ label, value, hint, meta, mono, tall, onApply, onDraft }: {
  label: string
  value: JsonValue
  hint?: string
  meta?: ReactNode
  mono?: boolean
  tall?: boolean
  onApply: (value: JsonValue, base: JsonValue) => void
  onDraft: (dirty: boolean) => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  const serialized = JSON.stringify(value, null, 2)
  const [edited, setEdited] = useState<string | null>(null)
  const [error, setError] = useState("")
  const base = useRef<string | null>(null)
  const draft = useRef(onDraft)
  draft.current = onDraft
  const text = edited ?? serialized
  const dirty = text !== serialized
  useEffect(() => { if (edited === serialized) setEdited(null) }, [edited, serialized])
  useEffect(() => { draft.current(dirty) }, [dirty])
  useEffect(() => () => draft.current(false), [])
  const apply = () => {
    try {
      const parsed = JSON.parse(text) as JsonValue
      if (Array.isArray(value) && !Array.isArray(parsed)) throw new Error("Informe uma lista JSON (entre colchetes).")
      if (isObject(value) && !isObject(parsed)) throw new Error("Informe um objeto JSON (entre chaves).")
      onApply(parsed, base.current === null ? value : JSON.parse(base.current) as JsonValue)
      base.current = null
      setEdited(null)
      setError("")
    } catch (cause) {
      setError(cause instanceof SyntaxError ? "JSON inválido. Confira aspas, vírgulas e chaves." : (cause as Error).message)
    }
  }
  const discard = () => {
    base.current = null
    setEdited(null)
    setError("")
  }
  const status = (dirty || meta) && (
    <span className="flex min-w-0 items-baseline justify-end gap-2">
      {dirty && <span className="shrink-0 text-[11px] font-medium text-flow-warning">Edição pendente</span>}
      {meta}
    </span>
  )
  return (
    <div>
      <Field id={id} label={label} hint={hint} mono={mono} meta={status}>
        <textarea
          id={id}
          value={text}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe(hint && hintOf(id), error && errorId)}
          className={cn(ui.textarea, "resize-y font-mono text-xs leading-5", tall ? "min-h-48" : "min-h-28", error && invalidField)}
          onChange={(event) => {
            if (base.current === null) base.current = serialized
            setEdited(event.target.value === serialized ? null : event.target.value)
          }}
        />
      </Field>
      {error && <p id={errorId} role="alert" className={ui.error}>{error}</p>}
      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={apply} className={ui.primaryButton}>Aplicar JSON</button>
          <button type="button" onClick={discard} className={ui.button}>Descartar edição</button>
        </div>
      )}
    </div>
  )
}

function TechnicalText({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [wide] = useState(() => value.includes("\n") || value.length > 60)
  if (wide || value.includes("\n")) {
    return (
      <textarea
        id={id}
        spellCheck={false}
        className={cn(ui.textarea, "min-h-20 resize-y font-mono text-xs leading-5")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return <input id={id} className={ui.input} value={value} onChange={(event) => onChange(event.target.value)} />
}

function NumberInput({ id, value, rule, name, describedBy, onCommit }: {
  id: string
  value: JsonValue | undefined
  rule: NumberRule
  name?: string
  describedBy?: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const stored = typeof value === "number" ? String(value) : typeof value === "string" && parseNumber(value, { integer: false }) !== undefined ? value.trim() : ""
  const text = draft ?? stored
  const problem = text.trim() === "" ? draft === null ? "" : numberMessage(rule) : parseNumber(text, rule) === undefined ? numberMessage(rule) : ""
  const errorId = `${id}-error`
  return (
    <>
      <input
        id={id}
        type="number"
        inputMode={rule.integer ? "numeric" : "decimal"}
        min={rule.min}
        max={rule.max}
        step={rule.step ?? "any"}
        aria-label={name}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describe(describedBy, problem && errorId)}
        className={cn(ui.input, "tabular-nums", problem && invalidField)}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const parsed = parseNumber(next, rule)
          if (parsed !== undefined && parsed !== value) onCommit(parsed)
        }}
        onBlur={() => setDraft(null)}
      />
      {problem && <p id={errorId} className={ui.error}>{problem}</p>}
    </>
  )
}

function Section({ title, hint, meta, edge = "none", children }: {
  title: string
  hint?: string
  meta?: ReactNode
  edge?: Edge
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={`${id}-title`} aria-describedby={hint ? `${id}-hint` : undefined} className={cn("space-y-3", edgeClass[edge])}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-xs font-semibold text-flow-fg">{title}</h3>
        {meta}
      </div>
      {hint && <p id={`${id}-hint`} className={cn(ui.hint, "mt-0")}>{hint}</p>}
      {children}
    </section>
  )
}

function Counter({ count, max, noun }: { count: number; max: number; noun: string }) {
  return (
    <span className={cn("text-[11px] font-semibold tabular-nums", count >= max ? "text-flow-warning" : "text-flow-muted")}>
      <span aria-hidden>{count}/{max}</span>
      <span className="sr-only">{count} de {max} {plural(lowerFirst(noun))}</span>
    </span>
  )
}

function ItemCard({ title, output, removeLabel, removeDisabled, onRemove, children }: {
  title: string
  output?: string
  removeLabel: string
  removeDisabled: boolean
  onRemove: () => void
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <div role="group" aria-labelledby={titleId} className={cn(ui.card, "space-y-2.5 p-3")}>
      <div className="flex items-center gap-2">
        <span id={titleId} className="text-xs font-semibold text-flow-fg">{title}</span>
        {output && <span className={outputTag}>{output}</span>}
        <button
          type="button"
          disabled={removeDisabled}
          aria-label={removeLabel}
          title={removeLabel}
          className={cn(iconDangerButton, !output && "ml-auto")}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  )
}

function AddButton({ id, label, disabled, onClick }: { id: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button id={id} type="button" disabled={disabled} className={addButton} onClick={onClick}>
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )
}

function ItemInput({ id, spec, value, name, onChange }: {
  id: string
  spec: ItemFieldSpec
  value: JsonValue | undefined
  name: string
  onChange: (value: JsonValue) => void
}) {
  if (spec.kind === "checkbox") {
    return (
      <div className={toggleRow}>
        <input id={id} type="checkbox" aria-label={name} className={checkbox} checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <label htmlFor={id} className={toggleLabel}>{spec.label}</label>
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={cn(ui.label, "break-words")}>{spec.label}</label>
      {spec.kind === "number" ? (
        <NumberInput id={id} value={value} rule={numberRule(spec)} name={name} onCommit={onChange} />
      ) : spec.kind === "textarea" ? (
        <textarea
          id={id}
          aria-label={name}
          className={cn(ui.textarea, "min-h-20 resize-y")}
          placeholder={spec.placeholder}
          value={textOf(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input id={id} aria-label={name} className={ui.input} placeholder={spec.placeholder} value={textOf(value)} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

function ObjectListEditor({ spec, items, outputs, trailing, edge, footer, onChange }: {
  spec: FieldSpec
  items: JsonValue[]
  outputs: boolean
  trailing: string[]
  edge: Edge
  footer?: ReactNode
  onChange: (items: JsonValue[], change?: OutputChange) => void
}) {
  const uid = useId()
  const noun = spec.itemLabel || "Item"
  const item = lowerFirst(noun)
  const fields = spec.itemFields ?? []
  const min = spec.min ?? 0
  const atLimit = spec.max !== undefined && items.length >= spec.max
  const addId = `${uid}-add`
  const fieldId = (index: number, position: number) => `${uid}-${index}-${position}`
  const compact = fields.length === 2 && fields.every((field) => field.kind === undefined || field.kind === "text" || field.kind === "number")
  const columns = fields.map((field) => field.kind === "number" ? "6rem" : "minmax(0, 1fr)").join(" ")
  const update = (index: number, key: string, value: JsonValue) => onChange(items.map((entry, position) => position === index && isRecord(entry) ? { ...entry, [key]: value } : entry))
  const add = () => {
    onChange([...items, newItemOf(spec)], outputs ? { kind: "insert", index: items.length } : undefined)
    focusSoon(fieldId(items.length, 0))
  }
  const remove = (index: number) => {
    onChange(items.filter((_, position) => position !== index), outputs ? { kind: "remove", index } : undefined)
    focusSoon(addId)
  }
  return (
    <Section title={spec.label} hint={spec.hint} edge={edge} meta={spec.max !== undefined && <Counter count={items.length} max={spec.max} noun={noun} />}>
      {items.length === 0 && <p className={emptyNote}>{emptyList(noun)}</p>}
      {items.map((entry, index) => {
        const number = index + 1
        return (
          <ItemCard
            key={index}
            title={`${noun} ${number}`}
            output={outputs ? `output-${index}` : undefined}
            removeLabel={`Remover ${item} ${number}`}
            removeDisabled={items.length <= min}
            onRemove={() => remove(index)}
          >
            {isRecord(entry) && fields.every((field) => !structured(entry[field.key])) ? (
              <div className={compact ? "grid gap-2" : "space-y-2.5"} style={compact ? { gridTemplateColumns: columns } : undefined}>
                {fields.map((field, position) => (
                  <ItemInput
                    key={field.key}
                    id={fieldId(index, position)}
                    spec={field}
                    value={entry[field.key]}
                    name={itemName(field.label, noun, number)}
                    onChange={(value) => update(index, field.key, value)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-4 text-flow-warning">Formato não reconhecido. Edite este item pelo JSON completo.</p>
            )}
          </ItemCard>
        )
      })}
      {outputs && trailing.map((label, position) => (
        <div key={label} className="flex items-center gap-2 rounded-xl border border-dashed border-flow-border px-3 py-2">
          <span className="text-xs font-semibold text-flow-muted-strong">{label}</span>
          <span className={outputTag}>output-{items.length + position}</span>
        </div>
      ))}
      {footer}
      <AddButton id={addId} label={spec.addLabel || `Adicionar ${item}`} disabled={atLimit} onClick={add} />
      {atLimit && <p className={limitNote}>Limite de {spec.max} {plural(item)} atingido.</p>}
    </Section>
  )
}

function WeightTotal({ paths }: { paths: JsonValue[] }) {
  const weights = paths.map((path) => isRecord(path) && typeof path.weight === "number" && Number.isFinite(path.weight) ? path.weight : undefined)
  if (paths.length === 0 || weights.some((weight) => weight === undefined)) return null
  const total = Math.round(weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0) * 100) / 100
  const expected = total === 100
  return (
    <p className={cn("text-[11px] font-medium tabular-nums", expected ? "text-flow-muted" : "text-flow-warning")}>
      Soma dos pesos: {total.toLocaleString("pt-BR")}{expected ? "" : ". O total esperado é 100."}
    </p>
  )
}

function PairsEditor({ spec, data, edge, onChange }: {
  spec: FieldSpec
  data: JsonObject
  edge: Edge
  onChange: (data: JsonObject, change?: OutputChange) => void
}) {
  const uid = useId()
  const noun = spec.itemLabel || "Item"
  const item = lowerFirst(noun)
  const fields = spec.itemFields ?? []
  const pattern = pairPattern(spec)
  const indices = fields.length ? indexedKeys(data, fields[0].key) : []
  const min = spec.min ?? 1
  const atLimit = spec.max !== undefined && indices.length >= spec.max
  const addId = `${uid}-add`
  const fieldId = (index: number, position: number) => `${uid}-${index}-${position}`
  const add = () => {
    const index = (indices.at(-1) ?? 0) + 1
    let next: JsonObject = { ...data }
    for (const field of fields) {
      const key = `${field.key}-${index}`
      if (!has(next, key)) next = { ...next, [key]: "" }
    }
    onChange(next, { kind: "insert", index: indices.length })
    focusSoon(fieldId(index, 0))
  }
  const remove = (position: number) => {
    if (!pattern) return
    onChange(reindex(data, pattern, indices, indices[position]), { kind: "remove", index: position })
    focusSoon(addId)
  }
  return (
    <Section title={spec.label} hint={spec.hint} edge={edge} meta={spec.max !== undefined && <Counter count={indices.length} max={spec.max} noun={noun} />}>
      {indices.length === 0 && <p className={emptyNote}>{emptyList(noun)}</p>}
      {indices.map((index, position) => {
        const number = position + 1
        const missing = fields.length > 0 && !textOf(data[`${fields[0].key}-${index}`]).trim()
        const problemId = `${uid}-${index}-problem`
        return (
          <ItemCard
            key={index}
            title={`${noun} ${number}`}
            output={`output-${position}`}
            removeLabel={`Remover ${item} ${number}`}
            removeDisabled={indices.length <= min}
            onRemove={() => remove(position)}
          >
            <div className="grid grid-cols-2 gap-2">
              {fields.map((field, column) => {
                const key = `${field.key}-${index}`
                const id = fieldId(index, column)
                const invalid = column === 0 && missing
                return (
                  <div key={field.key} className="min-w-0">
                    <label htmlFor={id} className={ui.label}>{field.label}</label>
                    <input
                      id={id}
                      aria-label={itemName(field.label, noun, number)}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? problemId : undefined}
                      className={cn(ui.input, invalid && invalidField)}
                      placeholder={field.placeholder}
                      value={textOf(data[key])}
                      onChange={(event) => onChange({ ...data, [key]: event.target.value })}
                    />
                  </div>
                )
              })}
            </div>
            {missing && <p id={problemId} className={ui.error}>Preencha este campo.</p>}
          </ItemCard>
        )
      })}
      <AddButton id={addId} label={spec.addLabel || `Adicionar ${item}`} disabled={atLimit} onClick={add} />
      {atLimit && <p className={limitNote}>Limite de {spec.max} {plural(item)} atingido.</p>}
    </Section>
  )
}

function TextListEditor({ label, hint, noun, items, onChange }: { label: string; hint?: string; noun: string; items: string[]; onChange: (items: string[]) => void }) {
  const uid = useId()
  const [pending, setPending] = useState(false)
  const labelId = `${uid}-label`
  const hintId = `${uid}-hint`
  const addId = `${uid}-add`
  const subject = lowerFirst(label)
  const item = lowerFirst(noun)
  const female = feminine(item)
  const rows = pending ? [...items, ""] : items
  const change = (index: number, text: string) => {
    if (index < items.length) onChange(items.map((entry, position) => position === index ? text : entry))
    else if (text) {
      setPending(false)
      onChange([...items, text])
    }
  }
  const add = () => {
    setPending(true)
    focusSoon(`${uid}-${items.length}`)
  }
  const remove = (index: number) => {
    if (index < items.length) {
      onChange(items.filter((_, position) => position !== index))
      focusSoon(pending ? `${uid}-${items.length - 1}` : addId)
      return
    }
    setPending(false)
    focusSoon(addId)
  }
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p id={labelId} className={cn(ui.label, "mb-0 min-w-0 break-words")}>{label}</p>
        {items.length > 0 && <span className="shrink-0 text-[11px] tabular-nums text-flow-muted">{items.length} {items.length === 1 ? item : plural(item)}</span>}
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className={emptyNote}>{emptyList(noun)}</p>}
        {rows.map((value, index) => {
          const number = index + 1
          return (
            <div key={index} className="flex items-center gap-1.5">
              <input
                id={`${uid}-${index}`}
                aria-label={`${noun} ${number} de ${subject}`}
                className={ui.input}
                value={value}
                onChange={(event) => change(index, event.target.value)}
              />
              <button
                type="button"
                aria-label={`Remover ${item} ${number} de ${subject}`}
                title={`Remover ${item} ${number}`}
                className={iconDangerButton}
                onClick={() => remove(index)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
        {pending && <p className={ui.hint}>{female ? "A" : "O"} {item} é {female ? "gravada quando preenchida" : "gravado quando preenchido"}.</p>}
        <AddButton id={addId} label={`Adicionar ${item}`} disabled={pending} onClick={add} />
      </div>
      {hint && <p id={hintId} className={ui.hint}>{hint}</p>}
    </div>
  )
}

function KeyValueEditor({ label, hint, value, onChange }: { label: string; hint?: string; value: Record<string, string>; onChange: (value: JsonObject) => void }) {
  const uid = useId()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [pending, setPending] = useState<{ key: string; value: string } | null>(null)
  const labelId = `${uid}-label`
  const hintId = `${uid}-hint`
  const addId = `${uid}-add`
  const entries = Object.entries(value)
  const rows: Array<[string, string]> = pending ? [...entries, [pending.key, pending.value]] : entries
  const keysExcept = (index: number) => entries.filter((_, position) => position !== index).map(([key]) => key)
  const keyProblem = (key: string, others: string[]) => !key.trim() ? "Informe a chave." : others.includes(key) ? "Chave repetida." : ""
  const forget = (index: number) => setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([position]) => Number(position) !== index)))
  const save = (index: number, key: string, next: JsonObject) => {
    onChange(next)
    const position = Object.keys(next).indexOf(key)
    if (position !== index) focusEnd(`${uid}-${position}-key`)
  }
  const rename = (index: number, key: string) => {
    if (index === entries.length) {
      if (!pending) return
      if (keyProblem(key, keysExcept(-1))) setPending({ ...pending, key })
      else {
        setPending(null)
        save(index, key, { ...value, [key]: pending.value })
      }
      return
    }
    if (keyProblem(key, keysExcept(index))) {
      setDrafts((current) => ({ ...current, [index]: key }))
      return
    }
    forget(index)
    save(index, key, Object.fromEntries(entries.map(([current, text], position) => [position === index ? key : current, text])))
  }
  const change = (index: number, text: string) => {
    if (index === entries.length) {
      if (pending) setPending({ ...pending, value: text })
      return
    }
    onChange(Object.fromEntries(entries.map(([key, current], position) => [key, position === index ? text : current])))
  }
  const remove = (index: number) => {
    if (index === entries.length) {
      setPending(null)
      focusSoon(addId)
      return
    }
    setDrafts({})
    onChange(Object.fromEntries(entries.filter((_, position) => position !== index)))
    focusSoon(pending ? `${uid}-${entries.length - 1}-key` : addId)
  }
  const add = () => {
    setPending({ key: "", value: "" })
    focusSoon(`${uid}-${entries.length}-key`)
  }
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p id={labelId} className={cn(ui.label, "mb-0 min-w-0 break-words")}>{label}</p>
        {entries.length > 0 && <span className="shrink-0 text-[11px] tabular-nums text-flow-muted">{entries.length} {entries.length === 1 ? "par" : plural("par")}</span>}
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className={emptyNote}>Nenhum par cadastrado.</p>}
        {rows.map(([key, text], index) => {
          const number = index + 1
          const isPending = index === entries.length
          const shown = isPending ? key : drafts[index] ?? key
          const problem = isPending ? key ? keyProblem(key, keysExcept(-1)) : "" : drafts[index] === undefined ? "" : keyProblem(drafts[index], keysExcept(index))
          const problemId = `${uid}-${index}-problem`
          return (
            <div key={index}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
                <input
                  id={`${uid}-${index}-key`}
                  aria-label={itemName("Chave", "par", number)}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? problemId : undefined}
                  spellCheck={false}
                  placeholder="Chave"
                  className={cn(ui.input, "font-mono text-xs", problem && invalidField)}
                  value={shown}
                  onChange={(event) => rename(index, event.target.value)}
                  onBlur={() => { if (!isPending) forget(index) }}
                />
                <input
                  id={`${uid}-${index}-value`}
                  aria-label={itemName("Valor", "par", number)}
                  placeholder="Valor"
                  className={ui.input}
                  value={text}
                  onChange={(event) => change(index, event.target.value)}
                />
                <button
                  type="button"
                  aria-label={`Remover par ${number}`}
                  title={`Remover par ${number}`}
                  className={iconDangerButton}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {problem && <p id={problemId} className={ui.error}>{problem}</p>}
              {isPending && !key && <p className={ui.hint}>O par é gravado quando a chave é preenchida.</p>}
            </div>
          )
        })}
        <AddButton id={addId} label="Adicionar par" disabled={pending !== null} onClick={add} />
      </div>
      {hint && <p id={hintId} className={ui.hint}>{hint}</p>}
    </div>
  )
}

function JsonField({ fieldKey, label, hint, value, onApply, onDraft }: {
  fieldKey: string
  label: string
  hint?: string
  value: JsonValue
  onApply: (value: JsonValue) => void
  onDraft: (dirty: boolean) => void
}) {
  const noun = has(TEXT_LIST_NOUNS, fieldKey) ? TEXT_LIST_NOUNS[fieldKey] : undefined
  const strings = Array.isArray(value) && value.every((entry) => typeof entry === "string")
  const [listed, setListed] = useState(noun !== undefined)
  if (strings && value.length > 0 && !listed) setListed(true)
  if (strings && (listed || value.length > 0)) {
    return <TextListEditor label={label} hint={hint} noun={noun ?? "Item"} items={value as string[]} onChange={onApply} />
  }
  if (isStringRecord(value)) return <KeyValueEditor label={label} hint={hint} value={value} onChange={onApply} />
  return <JsonEditor label={label} hint={hint} value={value} onApply={(next) => onApply(next)} onDraft={onDraft} />
}

function MenuTargetField({ id, spec, value, onSelect }: {
  id: string
  spec: FieldSpec
  value: JsonValue | undefined
  onSelect: (target: string, menus: MenuEntry[]) => void
}) {
  const signature = useStore(menuSignature)
  const menus = useMemo(() => (JSON.parse(signature) as Array<[string, string]>).map(([menu, title]) => ({ id: menu, title })), [signature])
  const current = textOf(value)
  const known = menus.some((menu) => menu.id === current)
  const hint = menus.length ? spec.hint : "Adicione um Menu de Opções ao fluxo para escolher o destino."
  return (
    <Field id={id} label={spec.label} hint={hint}>
      <select
        id={id}
        aria-describedby={hint ? hintOf(id) : undefined}
        className={ui.select}
        value={current}
        onChange={(event) => { if (event.target.value) onSelect(event.target.value, menus) }}
      >
        {current === "" && <option value="" className={ui.option}>{menus.length ? "Selecione um menu" : "Nenhum menu no fluxo"}</option>}
        {menus.map((menu) => <option key={menu.id} value={menu.id} className={ui.option}>{menuLabel(menu)}</option>)}
        {current !== "" && !known && <option value={current} className={ui.option}>ID {current} (não está no fluxo)</option>}
      </select>
    </Field>
  )
}

function TimeRulesEditor({ label, value, onChange }: { label: string; value: JsonValue | undefined; onChange: (rules: JsonValue) => void }) {
  const uid = useId()
  const labelId = `${uid}-label`
  const rules = Array.isArray(value) ? value : []
  const ruleIds = rules.map((rule) => isObject(rule) && rule.id !== undefined ? String(rule.id) : "")
  const update = (index: number, patch: JsonObject) => onChange(rules.map((rule, position) => position === index && isObject(rule) ? { ...rule, ...patch } as JsonValue : rule))
  const addRule = () => {
    let stamp = Date.now()
    while (ruleIds.includes(`rule-${stamp}`)) stamp++
    onChange([...rules, newTimeRule(`rule-${stamp}`)])
  }
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-3">
      <p id={labelId} className={cn(ui.label, "mb-0")}>{label}</p>
      {rules.map((rule, index) => {
        if (!isObject(rule)) return null
        const number = index + 1
        const ruleKey = ruleIds[index] && ruleIds.indexOf(ruleIds[index]) === index ? ruleIds[index] : `${ruleIds[index]}#${index}`
        const days = Array.isArray(rule.weekDays) ? rule.weekDays.map(String) : []
        const start = String(rule.startTime ?? "")
        const end = String(rule.endTime ?? "")
        const hasDay = weekDayOptions.some((day) => days.includes(day.value))
        const problem = !hasDay
          ? "Selecione ao menos um dia."
          : !TIME.test(start) || !TIME.test(end)
            ? "Informe o início e o fim."
            : start > end ? "O início deve ser anterior ao fim." : ""
        const timesInvalid = hasDay && problem !== ""
        const ruleId = `${uid}-rule-${index}`
        const problemId = `${ruleId}-problem`
        const times = [["startTime", "Início", start], ["endTime", "Fim", end]] as const
        return (
          <div key={ruleKey} role="group" aria-labelledby={`${ruleId}-title`} className={cn(ui.card, "space-y-3 p-3")}>
            <div className="flex items-center justify-between gap-2">
              <span id={`${ruleId}-title`} className="text-xs font-semibold text-flow-fg">Horário {number}</span>
              <button
                type="button"
                aria-label={`Remover horário ${number}`}
                title={`Remover horário ${number}`}
                disabled={rules.length <= 1}
                className={iconDangerButton}
                onClick={() => onChange(rules.filter((_, position) => position !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <div role="group" aria-label={`Dias do horário ${number}`} aria-describedby={hasDay ? undefined : problemId} className="grid grid-cols-7 gap-1">
              {weekDayOptions.map((day) => {
                const active = days.includes(day.value)
                const name = dayNames[day.value] || day.label
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={active}
                    aria-label={name}
                    title={name}
                    onClick={() => update(index, { weekDays: weekDayOptions.map((entry) => entry.value).filter((entry) => entry === day.value ? !active : days.includes(entry)) })}
                    className={cn(
                      "h-8 rounded-md border text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
                      active ? "border-flow-accent bg-flow-accent text-white" : "border-flow-border bg-flow-surface text-flow-muted-strong hover:border-flow-accent/50 hover:text-flow-fg",
                    )}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {times.map(([key, text, current]) => (
                <div key={key}>
                  <label htmlFor={`${ruleId}-${key}`} className={ui.label}>{text}</label>
                  <input
                    id={`${ruleId}-${key}`}
                    type="time"
                    aria-label={`${text} do horário ${number}`}
                    aria-invalid={timesInvalid || undefined}
                    aria-describedby={timesInvalid ? problemId : undefined}
                    className={cn(ui.input, "tabular-nums", timesInvalid && invalidField)}
                    value={current}
                    onChange={(event) => update(index, { [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>
            {problem && <p id={problemId} className={ui.error}>{problem}</p>}
          </div>
        )
      })}
      <button type="button" className={addButton} onClick={addRule}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Adicionar horário
      </button>
      <p className={cn(ui.hint, "mt-0")}>A saída “Dentro do horário” é usada quando o momento atual está em uma das regras; caso contrário, “Fora do horário”.</p>
    </div>
  )
}

export default function NodeConfigPanel({ node, updateData, removeOption, removeOutput, insertOutput, onClose, onRemove, onDuplicate, onDraft }: {
  node: AtendimentoNode
  updateData: (data: JsonObject) => void
  removeOption: (option: number) => void
  removeOutput?: (index: number, data: JsonObject) => void
  insertOutput?: (index: number, data: JsonObject) => void
  onClose: () => void
  onRemove: () => void
  onDuplicate: () => void
  onDraft: (field: string, dirty: boolean) => void
}) {
  const uid = useId()
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const type = node.data.type
  const definition = getDefinition(type)
  const payload = node.data.data
  const color = type === NOTE_TYPE ? noteColor(payload.color) : getComponentColor(type)
  const Icon = componentIcon(type)
  const fields = definition?.fields || []
  const isStart = type === START_TYPE
  const isApi = API_TYPES.has(type)
  const labels: Record<string, string> = { ...technicalLabels, ...definition?.technicalLabels }
  const indexed = fields.flatMap((field) => indexedPattern(field) ?? [])
  const primaryKeys = new Set(fields.flatMap((field) => [field.key, ...mirrorKeys(field)]))
  const technical = isStart ? [] : Object.entries(payload).filter(([key]) => !primaryKeys.has(key) && !indexed.some((pattern) => pattern.test(key)))
  const technicalPending = technical.some(([key]) => pending[key])
  const outputRule = definition?.outputRule

  const track = (field: string, dirty: boolean) => {
    setPending((current) => Boolean(current[field]) === dirty ? current : { ...current, [field]: dirty })
    onDraft(field, dirty)
  }
  const holdOpen = (locked: boolean) => (event: MouseEvent<HTMLElement>) => {
    if (locked && event.currentTarget.parentElement?.hasAttribute("open")) event.preventDefault()
  }
  const write = (next: JsonObject, { complete = false, change }: WriteOptions = {}) => {
    const apiChanged = isApi && API_KEYS.some((key) => JSON.stringify(next[key]) !== JSON.stringify(payload[key]))
    let data = apiChanged ? { ...next, curl: buildCurl(next), isApiValidated: false, validated_signature: "" } : next
    const shape = COMPLETED_TYPES.has(type) || ORDERED_TYPES.has(type) ? knownShape(definition) : undefined
    if (shape && complete && COMPLETED_TYPES.has(type)) data = completeKeys(payload, data, shape)
    if (shape && ORDERED_TYPES.has(type)) data = placeKeys(payload, data, Object.keys(shape))
    if (!change && JSON.stringify(data) === JSON.stringify(payload)) return
    if (change?.kind === "remove" && removeOutput) removeOutput(change.index, data)
    else if (change?.kind === "insert" && insertOutput) insertOutput(change.index, data)
    else updateData(data)
  }
  const setKey = (key: string, value: JsonValue) => write({ ...payload, [key]: value })
  const setField = (spec: FieldSpec, value: JsonValue | undefined, change?: OutputChange) => {
    let next: JsonObject = value === undefined ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== spec.key)) : { ...payload, [spec.key]: value }
    for (const mirror of mirrorKeys(spec)) next = { ...next, [mirror]: value ?? "" }
    write(next, { complete: true, change })
  }
  const chooseMenu = (spec: FieldSpec, target: string, menus: MenuEntry[]) => {
    let next: JsonObject = { ...payload, [spec.key]: target }
    for (const mirror of mirrorKeys(spec)) next = { ...next, [mirror]: target }
    next = { ...next, availableNodes: menus.map((menu) => ({ id: menu.id, value: menu.id, name: menu.title })), targetNodeName: menus.find((menu) => menu.id === target)?.title ?? "" }
    write(next, { complete: true })
  }
  const edgeOf = (index: number): Edge => {
    const first = index === 0
    const last = index === fields.length - 1
    return first && last ? "none" : first ? "bottom" : last ? "top" : "both"
  }

  const renderMenu = (spec: FieldSpec, edge: Edge) => {
    const indices = optionIndices(payload)
    const max = spec.max ?? MAX_OPTIONS
    const min = spec.min ?? 1
    const noun = spec.itemLabel || "Opção"
    const atLimit = indices.length >= max
    const addId = `${uid}-option-add`
    const digitCounts = new Map<string, number>()
    for (const option of indices) {
      const digit = String(payload[`opt-${option}`] ?? "").trim()
      if (digit) digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1)
    }
    const addOption = () => {
      const option = (indices.at(-1) || 0) + 1
      write({ ...payload, [`opt-${option}`]: nextOptionDigit(payload), [`text-${option}`]: "", [`description-${option}`]: "" })
      focusSoon(`${uid}-option-${option}-text`)
    }
    return (
      <Section key={spec.key} title={spec.label} hint={spec.hint} edge={edge} meta={<Counter count={indices.length} max={max} noun={noun} />}>
        {indices.map((option, position) => {
          const number = position + 1
          const digit = String(payload[`opt-${option}`] ?? "").trim()
          const repeated = (digitCounts.get(digit) || 0) > 1
          const untitled = !String(payload[`text-${option}`] ?? "").trim()
          const flagged = !digit || repeated ? "opt" : untitled ? "text" : ""
          const problem = !digit ? "Informe o número da opção." : repeated ? "Número repetido em outra opção." : untitled ? "Informe o título da opção." : ""
          const problemId = `${uid}-option-${option}-problem`
          return (
            <ItemCard
              key={option}
              title={`${noun} ${number}`}
              output={`output-${position}`}
              removeLabel={`Remover ${lowerFirst(noun)} ${number}`}
              removeDisabled={indices.length <= min}
              onRemove={() => {
                removeOption(option)
                focusSoon(addId)
              }}
            >
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                {OPTION_FIELDS.map(([prefix, label]) => {
                  const key = `${prefix}-${option}`
                  const id = `${uid}-option-${option}-${prefix}`
                  const invalid = flagged === prefix
                  return (
                    <div key={prefix} className={prefix === "description" ? "col-span-2" : undefined}>
                      <label htmlFor={id} className={ui.label}>{label}</label>
                      <input
                        id={id}
                        aria-label={itemName(label, noun, number)}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? problemId : undefined}
                        className={cn(ui.input, prefix === "opt" && "text-center tabular-nums", invalid && invalidField)}
                        placeholder={prefix === "description" ? "Opcional" : undefined}
                        value={String(payload[key] ?? "")}
                        onChange={(event) => setKey(key, event.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
              {problem && <p id={problemId} className={ui.error}>{problem}</p>}
            </ItemCard>
          )
        })}
        <AddButton id={addId} label={spec.addLabel || "Adicionar opção"} disabled={atLimit} onClick={addOption} />
        {atLimit && <p className={limitNote}>Limite de {max} {plural(lowerFirst(noun))} atingido.</p>}
      </Section>
    )
  }

  const renderStructured = (spec: FieldSpec, value: JsonValue) => (
    <JsonField
      key={spec.key}
      fieldKey={spec.key}
      label={spec.label}
      hint={spec.hint}
      value={value}
      onApply={(next) => setField(spec, next)}
      onDraft={(dirty) => track(spec.key, dirty)}
    />
  )

  const renderField = (spec: FieldSpec, index: number) => {
    const value = payload[spec.key]
    const id = `${uid}-field-${index}`
    const hintId = spec.hint ? hintOf(id) : undefined
    const edge = CARD_KINDS.has(spec.kind) ? edgeOf(index) : "none"
    if (spec.kind === "timeRules") {
      return <TimeRulesEditor key={spec.key} label={spec.label} value={value} onChange={(rules) => setField(spec, rules)} />
    }
    if (spec.kind === "menuOptions") return renderMenu(spec, edge)
    if (spec.kind === "conditionPairs") {
      return <PairsEditor key={spec.key} spec={spec} data={payload} edge={edge} onChange={(data, change) => write(data, { complete: true, change })} />
    }
    if (spec.kind === "weightedPaths" || spec.kind === "objectList") {
      if (value !== undefined && !Array.isArray(value)) return renderStructured(spec, value)
      const items = value ?? []
      const trailing = outputRule?.kind === "list" && outputRule.key === spec.key ? outputRule.trailing ?? [] : []
      return (
        <ObjectListEditor
          key={spec.key}
          spec={spec}
          items={items}
          outputs={spec.kind === "weightedPaths" || spec.drivesOutputs === true}
          trailing={trailing}
          edge={edge}
          footer={spec.kind === "weightedPaths" ? <WeightTotal paths={items} /> : undefined}
          onChange={(next, change) => setField(spec, next, change)}
        />
      )
    }
    if (spec.kind === "menuNode") {
      return <MenuTargetField key={spec.key} id={id} spec={spec} value={value} onSelect={(target, menus) => chooseMenu(spec, target, menus)} />
    }
    if (spec.kind === "json") return renderStructured(spec, value === undefined ? initialJson(type, spec.key) : value)
    if (structured(value)) return renderStructured(spec, value)
    if (spec.kind === "number") {
      return (
        <Field key={spec.key} id={id} label={spec.label} hint={spec.hint}>
          <NumberInput id={id} value={value} rule={numberRule(spec)} describedBy={hintId} onCommit={(next) => setField(spec, next)} />
        </Field>
      )
    }
    if (spec.kind === "numberText") {
      const rule = numberRule(spec)
      const text = textOf(value)
      const invalid = text !== "" && !numericText(text, rule)
      const errorId = `${id}-error`
      return (
        <Field key={spec.key} id={id} label={spec.label} hint={spec.hint}>
          <input
            id={id}
            inputMode={rule.integer ? "numeric" : "decimal"}
            aria-invalid={invalid || undefined}
            aria-describedby={describe(hintId, invalid && errorId)}
            className={cn(ui.input, "tabular-nums", invalid && invalidField)}
            placeholder={spec.placeholder}
            value={text}
            onChange={(event) => setField(spec, cleanNumberText(event.target.value, rule))}
          />
          {invalid && <p id={errorId} className={ui.error}>{numberMessage(rule)}</p>}
        </Field>
      )
    }
    if (spec.kind === "checkbox") {
      return (
        <div key={spec.key}>
          <div className={toggleRow}>
            <input id={id} type="checkbox" aria-describedby={hintId} className={checkbox} checked={value === true} onChange={(event) => setField(spec, event.target.checked)} />
            <label htmlFor={id} className={toggleLabel}>{spec.label}</label>
          </div>
          {spec.hint && <p id={hintId} className={ui.hint}>{spec.hint}</p>}
        </div>
      )
    }
    if (spec.kind === "select") {
      const options = spec.options || []
      const current = textOf(value)
      const blank = current === "" && !options.some((option) => option.value === "") ? [{ value: "", label: "Não definido" }] : []
      const extra = current && !options.some((option) => option.value === current) ? [{ value: current, label: `${current} (valor do arquivo)` }] : []
      return (
        <Field key={spec.key} id={id} label={spec.label} hint={spec.hint}>
          <select
            id={id}
            aria-describedby={hintId}
            className={ui.select}
            value={current}
            onChange={(event) => setField(spec, event.target.value === "" && value === undefined ? undefined : event.target.value)}
          >
            {[...blank, ...options, ...extra].map((option) => <option key={option.value} value={option.value} className={ui.option}>{option.label}</option>)}
          </select>
        </Field>
      )
    }
    const stored = textOf(value)
    const fallback = stored === "" && MIRROR_FALLBACK.has(`${type}.${spec.key}`) ? mirrorKeys(spec).map((mirror) => textOf(payload[mirror])).find(Boolean) : undefined
    const text = fallback ?? stored
    const limit = TEXT_LIMITS[`${type}.${spec.key}`]
    const mono = MONOSPACE_KEYS.has(spec.key)
    const overLimit = limit !== undefined && text.length > limit
    const derived = spec.key === "filename" ? fileNameFrom((FILE_NAME_SOURCES[type] ?? []).map((key) => textOf(payload[key])).find(Boolean)) : ""
    const suggestions = [...(spec.suggestions ?? []), ...(derived && derived !== text && !spec.suggestions?.includes(derived) ? [derived] : [])]
    return (
      <Field key={spec.key} id={id} label={spec.label} hint={spec.hint} meta={spec.kind === "textarea" && !mono && <CharacterCount length={text.length} limit={limit} />}>
        {spec.kind === "textarea" ? (
          <textarea
            id={id}
            aria-describedby={hintId}
            aria-invalid={overLimit || undefined}
            spellCheck={mono ? false : undefined}
            className={cn(ui.textarea, "resize-y", mono && "font-mono text-xs leading-5", overLimit && invalidField)}
            placeholder={spec.placeholder}
            value={text}
            onChange={(event) => setField(spec, event.target.value)}
          />
        ) : (
          <input
            id={id}
            aria-describedby={hintId}
            className={ui.input}
            inputMode={spec.kind === "url" ? "url" : undefined}
            spellCheck={spec.kind === "url" ? false : undefined}
            placeholder={spec.placeholder}
            value={text}
            list={suggestions.length ? `${id}-suggestions` : undefined}
            onChange={(event) => setField(spec, event.target.value)}
          />
        )}
        {suggestions.length > 0 && <datalist id={`${id}-suggestions`}>{suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
      </Field>
    )
  }

  const renderTechnical = ([key, value]: [string, JsonValue], index: number) => {
    const friendly = labels[key]
    const label = friendly || key
    const id = `${uid}-technical-${index}`
    const tag = friendly ? <code className={keyTag} title={key}>{key}</code> : undefined
    if (value === null || typeof value === "object") {
      return <JsonEditor key={key} label={label} mono={!friendly} meta={tag} value={value} onApply={(next) => setKey(key, next)} onDraft={(dirty) => track(key, dirty)} />
    }
    if (typeof value === "boolean") {
      return (
        <div key={key} className={toggleRow}>
          <input id={id} type="checkbox" className={checkbox} checked={value} onChange={(event) => setKey(key, event.target.checked)} />
          <label htmlFor={id} className={cn(toggleLabel, !friendly && "font-mono text-xs")}>{label}</label>
          {tag}
        </div>
      )
    }
    if (typeof value === "number") {
      return (
        <Field key={key} id={id} label={label} mono={!friendly} meta={tag}>
          <NumberInput id={id} value={value} rule={{ integer: false }} onCommit={(next) => setKey(key, next)} />
        </Field>
      )
    }
    return (
      <Field key={key} id={id} label={label} mono={!friendly} meta={tag}>
        <TechnicalText id={id} value={value} onChange={(next) => setKey(key, next)} />
      </Field>
    )
  }

  return (
    <aside aria-label="Configuração do componente" className={cn("flex h-full w-80 max-w-[90vw] shrink-0 flex-col border-l dark:[color-scheme:dark]", ui.panel)}>
      <header className="flex items-center justify-between gap-3 border-b border-flow-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", isStart && "bg-flow-success text-white")}
            style={isStart ? undefined : { color: categoryTint(color), backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-sm font-semibold leading-snug text-flow-fg">{getComponentLabel(type)}</h2>
            <p className="break-words text-[11px] leading-4 text-flow-muted">ID {node.id} · {type}</p>
          </div>
        </div>
        <button type="button" aria-label="Fechar configuração" title="Fechar configuração" onClick={onClose} className={iconButton}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {!definition && (
          <p className="flex gap-2 rounded-lg border border-flow-warning/40 bg-flow-warning/10 px-3 py-2.5 text-xs leading-5 text-flow-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-warning" aria-hidden />
            <span>Tipo preservado do arquivo, sem definição no editor. Os dados são exportados como estão.</span>
          </p>
        )}
        {isStart && <p className={note}>O início do fluxo não tem configurações. Conecte a saída dele ao primeiro componente do atendimento.</p>}
        {definition && !isStart && fields.length === 0 && <p className={note}>Nenhuma configuração necessária.</p>}
        {fields.length > 0 && <div className="space-y-4">{fields.map(renderField)}</div>}

        {isApi && (
          <div className="flex gap-2.5 rounded-lg border border-flow-border bg-flow-soft px-3 py-2.5">
            <span aria-hidden className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", payload.isApiValidated === true ? "bg-flow-success" : "bg-flow-muted")} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-flow-fg">{payload.isApiValidated === true ? "API validada" : "API não validada"}</p>
              <p className={cn(ui.hint, "mt-0.5")}>Alterar URL, método, corpo ou cabeçalhos regenera o cURL e exige nova validação.</p>
            </div>
          </div>
        )}

        {technical.length > 0 && (
          <details className={collapsible}>
            <summary className={summary} onClick={holdOpen(technicalPending)}>
              <ChevronRight className={chevron} aria-hidden />
              <span>Campos técnicos</span>
              <span className="rounded-md bg-flow-strong px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-flow-muted-strong">{technical.length}</span>
            </summary>
            <div className="mt-3 space-y-3">
              <p className={cn(ui.hint, "mt-0")}>Fazem parte do formato de Atendimento e são exportados exatamente como estão.</p>
              {technical.map(renderTechnical)}
            </div>
          </details>
        )}

        <details className={collapsible}>
          <summary className={summary} onClick={holdOpen(Boolean(pending.__raw))}>
            <ChevronRight className={chevron} aria-hidden />
            <span>Todos os dados do componente (JSON)</span>
          </summary>
          <div className="mt-3">
            <JsonEditor
              label="Dados do componente"
              tall
              hint="O HTML de origem fica preservado no arquivo e não é executado no editor."
              value={payload}
              onApply={(value, base) => write(mergeChanges(payload, value as JsonObject, base as JsonObject))}
              onDraft={(dirty) => track("__raw", dirty)}
            />
          </div>
        </details>
      </div>

      {!isStart && (
        <footer className="flex items-center gap-2 border-t border-flow-border px-4 py-3">
          <button type="button" onClick={onDuplicate} className={ui.button}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Duplicar
          </button>
          <button type="button" onClick={onRemove} className={cn(ui.dangerButton, "ml-auto")}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remover componente
          </button>
        </footer>
      )}
    </aside>
  )
}
