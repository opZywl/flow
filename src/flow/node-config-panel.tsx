"use client"

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { AlertTriangle, ChevronRight, Copy, Plus, Trash2, X } from "lucide-react"
import { START_TYPE, getComponentColor, getComponentLabel, getDefinition, newTimeRule, weekDayOptions } from "@/lib/atendimento/catalog"
import { isObject, nextOptionDigit, optionIndices } from "@/lib/atendimento/format"
import type { AtendimentoNode, FieldSpec, JsonObject, JsonValue } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { componentIcon } from "./nodes/atendimento-node"
import { ui } from "./ui"

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

const API_TYPES = ["consulta_api", "solicitar_dados"]
const API_KEYS = ["url_api", "method", "body_value", "headers"]
const OPTION_KEY = /^(opt|text|description)-\d+$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_OPTIONS = 10
const TEXT_LIMITS: Record<string, number> = { "envio_mensagem.title": 1024 }
const MONOSPACE_KEYS = new Set(["body_value"])
const OPTION_FIELDS = [["opt", "Número"], ["text", "Título"], ["description", "Descrição"]] as const

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

const describe = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined
const hintOf = (id: string) => `${id}-hint`

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
          <div key={ruleKey} className={cn(ui.card, "space-y-3 p-3")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-flow-fg">Horário {number}</span>
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

export default function NodeConfigPanel({ node, updateData, removeOption, onClose, onRemove, onDuplicate, onDraft }: {
  node: AtendimentoNode
  updateData: (data: JsonObject) => void
  removeOption: (option: number) => void
  onClose: () => void
  onRemove: () => void
  onDuplicate: () => void
  onDraft: (field: string, dirty: boolean) => void
}) {
  const uid = useId()
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const definition = getDefinition(node.data.type)
  const payload = node.data.data
  const color = getComponentColor(node.data.type)
  const Icon = componentIcon(node.data.type)
  const fields = definition?.fields || []
  const primaryKeys = new Set(fields.flatMap((field) => field.mirror ? [field.key, field.mirror] : [field.key]))
  const isMenu = node.data.type === "envio_mensagem"
  const isStart = node.data.type === START_TYPE
  const isApi = API_TYPES.includes(node.data.type)
  const indices = isMenu ? optionIndices(payload) : []
  const technical = isStart ? [] : Object.entries(payload).filter(([key]) => !primaryKeys.has(key) && !(isMenu && OPTION_KEY.test(key)))
  const technicalPending = technical.some(([key]) => pending[key])
  const atLimit = indices.length >= MAX_OPTIONS
  const digitCounts = new Map<string, number>()
  for (const option of indices) {
    const digit = String(payload[`opt-${option}`] ?? "").trim()
    if (digit) digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1)
  }

  const track = (field: string, dirty: boolean) => {
    setPending((current) => Boolean(current[field]) === dirty ? current : { ...current, [field]: dirty })
    onDraft(field, dirty)
  }
  const holdOpen = (locked: boolean) => (event: MouseEvent<HTMLElement>) => {
    if (locked && event.currentTarget.parentElement?.hasAttribute("open")) event.preventDefault()
  }
  const write = (next: JsonObject) => {
    const apiChanged = isApi && API_KEYS.some((key) => JSON.stringify(next[key]) !== JSON.stringify(payload[key]))
    updateData(apiChanged ? { ...next, curl: buildCurl(next), isApiValidated: false, validated_signature: "" } : next)
  }
  const set = (key: string, value: JsonValue | undefined, spec?: FieldSpec) => {
    const next: JsonObject = { ...payload }
    if (value === undefined) delete next[key]
    else next[key] = value
    if (spec?.mirror) next[spec.mirror] = value ?? ""
    write(next)
  }
  const addOption = () => {
    const option = (indices.at(-1) || 0) + 1
    write({ ...payload, [`opt-${option}`]: nextOptionDigit(payload), [`text-${option}`]: `Opção ${indices.length + 1}`, [`description-${option}`]: "" })
  }

  const renderField = (spec: FieldSpec, index: number) => {
    const value = payload[spec.key]
    const id = `${uid}-field-${index}`
    const hintId = spec.hint ? hintOf(id) : undefined
    if (spec.kind === "timeRules") {
      return <TimeRulesEditor key={spec.key} label={spec.label} value={value} onChange={(rules) => set(spec.key, rules)} />
    }
    if (spec.kind === "json") {
      return <JsonEditor key={spec.key} label={spec.label} hint={spec.hint} value={value ?? []} onApply={(next) => set(spec.key, next)} onDraft={(dirty) => track(spec.key, dirty)} />
    }
    if (spec.kind === "checkbox") {
      return (
        <div key={spec.key}>
          <div className={toggleRow}>
            <input id={id} type="checkbox" aria-describedby={hintId} className={checkbox} checked={value === true} onChange={(event) => set(spec.key, event.target.checked)} />
            <label htmlFor={id} className={toggleLabel}>{spec.label}</label>
          </div>
          {spec.hint && <p id={hintId} className={ui.hint}>{spec.hint}</p>}
        </div>
      )
    }
    if (spec.kind === "select") {
      const options = spec.options || []
      const current = value === undefined || value === null ? "" : String(value)
      const extra = current && !options.some((option) => option.value === current) ? [{ value: current, label: `${current} (valor do arquivo)` }] : []
      const undefinedOption = value === undefined && !options.some((option) => option.value === "") ? [{ value: "", label: "Não definido" }] : []
      return (
        <Field key={spec.key} id={id} label={spec.label} hint={spec.hint}>
          <select
            id={id}
            aria-describedby={hintId}
            className={ui.select}
            value={current}
            onChange={(event) => set(spec.key, event.target.value === "" && value === undefined ? undefined : event.target.value, spec)}
          >
            {[...undefinedOption, ...options, ...extra].map((option) => <option key={option.value} value={option.value} className={ui.option}>{option.label}</option>)}
          </select>
        </Field>
      )
    }
    const text = value === undefined || value === null ? "" : String(value)
    const limit = TEXT_LIMITS[`${node.data.type}.${spec.key}`]
    const mono = MONOSPACE_KEYS.has(spec.key)
    const overLimit = limit !== undefined && text.length > limit
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
            onChange={(event) => set(spec.key, event.target.value, spec)}
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
            list={spec.suggestions ? `${id}-suggestions` : undefined}
            onChange={(event) => set(spec.key, event.target.value, spec)}
          />
        )}
        {spec.suggestions && <datalist id={`${id}-suggestions`}>{spec.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
      </Field>
    )
  }

  const renderOption = (option: number, position: number) => {
    const number = position + 1
    const digit = String(payload[`opt-${option}`] ?? "").trim()
    const repeated = (digitCounts.get(digit) || 0) > 1
    const untitled = !String(payload[`text-${option}`] ?? "").trim()
    const flagged = !digit || repeated ? "opt" : untitled ? "text" : ""
    const problem = !digit ? "Informe o número da opção." : repeated ? "Número repetido em outra opção." : untitled ? "Informe o título da opção." : ""
    const problemId = `${uid}-option-${option}-problem`
    return (
      <div key={option} className={cn(ui.card, "space-y-2.5 p-3")}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-flow-fg">Opção {number}</span>
          <span className="ml-auto font-mono text-[10px] text-flow-muted">output-{position}</span>
          <button
            type="button"
            disabled={indices.length <= 1}
            aria-label={`Remover opção ${number}`}
            title={`Remover opção ${number}`}
            className={iconDangerButton}
            onClick={() => removeOption(option)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
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
                  aria-label={`${label} da opção ${number}`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? problemId : undefined}
                  className={cn(ui.input, prefix === "opt" && "text-center tabular-nums", invalid && invalidField)}
                  placeholder={prefix === "description" ? "Opcional" : undefined}
                  value={String(payload[key] ?? "")}
                  onChange={(event) => set(key, event.target.value)}
                />
              </div>
            )
          })}
        </div>
        {problem && <p id={problemId} className={ui.error}>{problem}</p>}
      </div>
    )
  }

  const renderTechnical = ([key, value]: [string, JsonValue], index: number) => {
    const friendly = technicalLabels[key]
    const label = friendly || key
    const id = `${uid}-technical-${index}`
    const tag = friendly ? <code className={keyTag} title={key}>{key}</code> : undefined
    if (value === null || typeof value === "object") {
      return <JsonEditor key={key} label={label} mono={!friendly} meta={tag} value={value} onApply={(next) => set(key, next)} onDraft={(dirty) => track(key, dirty)} />
    }
    if (typeof value === "boolean") {
      return (
        <div key={key} className={toggleRow}>
          <input id={id} type="checkbox" className={checkbox} checked={value} onChange={(event) => set(key, event.target.checked)} />
          <label htmlFor={id} className={cn(toggleLabel, !friendly && "font-mono text-xs")}>{label}</label>
          {tag}
        </div>
      )
    }
    if (typeof value === "number") {
      return (
        <Field key={key} id={id} label={label} mono={!friendly} meta={tag}>
          <input
            id={id}
            type="number"
            className={cn(ui.input, "tabular-nums")}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next)) set(key, next)
            }}
          />
        </Field>
      )
    }
    return (
      <Field key={key} id={id} label={label} mono={!friendly} meta={tag}>
        <TechnicalText id={id} value={value} onChange={(next) => set(key, next)} />
      </Field>
    )
  }

  return (
    <aside aria-label="Configuração do componente" className={cn("flex h-full w-80 max-w-[90vw] shrink-0 flex-col border-l dark:[color-scheme:dark]", ui.panel)}>
      <header className="flex items-center justify-between gap-3 border-b border-flow-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", isStart ? "bg-flow-success text-white" : "bg-flow-soft")}
            style={isStart ? undefined : { color }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-sm font-semibold leading-snug text-flow-fg">{getComponentLabel(node.data.type)}</h2>
            <p className="break-words text-[11px] leading-4 text-flow-muted">ID {node.id} · {node.data.type}</p>
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
            <span>Tipo importado sem exemplo no JSON de referência. Os dados são preservados como estão.</span>
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

        {isMenu && (
          <section aria-labelledby={`${uid}-options`} className="space-y-3 border-t border-flow-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 id={`${uid}-options`} className="text-xs font-semibold text-flow-fg">Opções e saídas</h3>
              <span className={cn("text-[11px] font-semibold tabular-nums", atLimit ? "text-flow-warning" : "text-flow-muted")}>
                <span aria-hidden>{indices.length}/{MAX_OPTIONS}</span>
                <span className="sr-only">{indices.length} de {MAX_OPTIONS} opções</span>
              </span>
            </div>
            <p className={cn(ui.hint, "mt-0")}>Cada opção gera uma saída própria, na mesma ordem da lista.</p>
            {indices.map(renderOption)}
            <button type="button" disabled={atLimit} className={addButton} onClick={addOption}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Adicionar opção
            </button>
            {atLimit && <p className="text-[11px] font-medium text-flow-warning">Limite de {MAX_OPTIONS} opções atingido.</p>}
          </section>
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

        {!isStart && (
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
        )}
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
