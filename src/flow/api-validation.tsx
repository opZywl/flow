"use client"

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react"
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react"
import {
  TEST_API_PATH,
  apiPlan,
  classifyResponse,
  clearedValidation,
  failedOutcome,
  initialValues,
  missingUrls,
  parseTestRequest,
  planKey,
  planTokens,
  targetProblem,
  testRequest,
  testedCalls,
  validationPatch,
  type ApiCall,
  type CallOutcome,
  type TestApiRequest,
  type TestApiResponse,
  type TestMethod,
} from "@/lib/atendimento/api-check"
import type { JsonObject } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { ui } from "./ui"

interface CallResult {
  key: string
  label: string
  method: string
  outcome: CallOutcome
}

interface Entry {
  skipped?: boolean
  results?: CallResult[]
  failed?: CallResult[]
}

interface Draft {
  key: string
  values: Record<string, string>
  methods: Record<string, TestMethod>
  missing: string[]
  results: CallResult[] | null
  running: boolean
}

type Tone = "muted" | "accent" | "warning" | "success"

const STORAGE = "flow.api"
const MAX_ENTRIES = 100
const SESSION_NOTE = "O teste vale só nesta sessão, porque o formato da plataforma não guarda a validação deste componente."
const STORED_NOTE = "Alterar URL, método, corpo ou cabeçalhos regenera o cURL e exige nova validação."
const VALUE_HINTS: Record<string, string> = { "solicitar_dados.input": "Use um exemplo do dado que o contato vai digitar, como um CPF." }
const DOTS: Record<Tone, string> = { muted: "bg-flow-muted", accent: "bg-flow-accent", warning: "bg-flow-warning", success: "bg-flow-success" }
const closeButton =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
const methodTag = "shrink-0 rounded bg-flow-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-4 text-flow-muted-strong"
const invalidField = "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function storedResults(value: unknown): CallResult[] | undefined {
  if (!Array.isArray(value)) return undefined
  const results = value.flatMap((item): CallResult[] => {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.label !== "string" || typeof item.method !== "string" || typeof item.message !== "string") return []
    return [{ key: item.key, label: item.label, method: item.method, outcome: { valid: true, message: item.message, fields: [], moreFields: 0, preview: "" } }]
  })
  return results.length ? results : undefined
}

function loadEntries(): Map<string, Entry> {
  const map = new Map<string, Entry>()
  if (typeof window === "undefined") return map
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE) ?? "[]")
    if (!Array.isArray(saved)) return map
    for (const item of saved.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(item) || typeof item[0] !== "string" || !isRecord(item[1])) continue
      const results = storedResults(item[1].results)
      const entry: Entry = { ...(item[1].skipped === true ? { skipped: true } : {}), ...(results ? { results } : {}) }
      if (entry.skipped || entry.results) map.set(item[0], entry)
    }
  } catch {
    return map
  }
  return map
}

const entries = loadEntries()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function persist(): void {
  try {
    const saved = Array.from(entries, ([key, entry]) => [key, {
      ...(entry.skipped ? { skipped: true } : {}),
      ...(entry.results ? { results: entry.results.map((result) => ({ key: result.key, label: result.label, method: result.method, message: result.outcome.message })) } : {}),
    }])
    window.sessionStorage.setItem(STORAGE, JSON.stringify(saved))
  } catch {
    return
  }
}

function remember(key: string, entry: Entry): void {
  entries.delete(key)
  entries.set(key, entry)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next()
    if (oldest.done) break
    entries.delete(oldest.value)
  }
  persist()
  for (const listener of listeners) listener()
}

async function check(request: TestApiRequest, signal: AbortSignal): Promise<CallOutcome> {
  const parsed = parseTestRequest(request)
  if (!parsed.ok) return failedOutcome(parsed.error.code, parsed.error.message)
  const local = targetProblem(new URL(parsed.request.url))
  if (local) return failedOutcome(local.code, local.message)
  let response: Response
  try {
    response = await fetch(TEST_API_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.request), signal, cache: "no-store" })
  } catch {
    return failedOutcome("offline")
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return failedOutcome(response.status === 429 ? "rate_limited" : "offline")
  }
  if (!isRecord(body) || typeof body.ok !== "boolean") return failedOutcome("unknown")
  return classifyResponse(body as unknown as TestApiResponse)
}

function fieldsText(outcome: CallOutcome): string {
  const shown = outcome.fields.join(", ")
  return outcome.moreFields ? `${shown} e mais ${outcome.moreFields}` : shown
}

function ResultLines({ results }: { results: CallResult[] }) {
  const several = results.length > 1
  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div key={result.key} className="min-w-0 space-y-1">
          <p className="break-words text-[11px] leading-4 text-flow-fg">
            {several && <span className="font-semibold">{result.label}: </span>}
            {result.outcome.message}
          </p>
          {result.outcome.fields.length > 0 && <p className="break-words text-[11px] leading-4 text-flow-muted">Campos na resposta: {fieldsText(result.outcome)}</p>}
          {result.outcome.preview && (
            <pre className="whitespace-pre-wrap break-all rounded-md border border-flow-border bg-flow-surface px-2 py-1.5 font-mono text-[10px] leading-4 text-flow-muted-strong">
              <span className="sr-only">Prévia da resposta: </span>
              {result.outcome.preview}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

function ResultBox({ valid, results }: { valid: boolean; results: CallResult[] }) {
  const Icon = valid ? CheckCircle2 : XCircle
  return (
    <div className={cn("space-y-1.5 rounded-lg border px-2.5 py-2", valid ? "border-flow-success/40 bg-flow-success/10" : "border-flow-danger/40 bg-flow-danger/10")}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-flow-fg">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", valid ? "text-flow-success" : "text-flow-danger")} aria-hidden />
        {valid ? "API válida" : "API inválida"}
      </p>
      <ResultLines results={results} />
    </div>
  )
}

export function ApiValidation({ nodeId, type, data, onPatch, onLocate }: {
  nodeId: string
  type: string
  data: JsonObject
  onPatch: (patch: JsonObject) => void
  onLocate?: (key: string) => void
}) {
  const uid = useId()
  const plan = useMemo(() => apiPlan(type, data), [type, data])
  const key = useMemo(() => (plan ? `${nodeId}:${planKey(plan)}` : ""), [nodeId, plan])
  const entry = useSyncExternalStore(subscribe, () => entries.get(key), () => undefined)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [said, setSaid] = useState("")
  const [focus, setFocus] = useState<{ targets: string[]; seq: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const latest = useRef({ key, data, onPatch })
  latest.current = { key, data, onPatch }

  useEffect(() => {
    abortRef.current?.abort()
  }, [key])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!focus) return
    for (const target of focus.targets) {
      const element = document.getElementById(target)
      if (element) {
        element.focus()
        return
      }
    }
  }, [focus])

  if (!plan) return null

  const ids = {
    title: `${uid}-title`,
    validate: `${uid}-validate`,
    again: `${uid}-again`,
    run: `${uid}-run`,
    retry: `${uid}-retry`,
    locate: (call: string) => `${uid}-locate-${call}`,
    value: (index: number) => `${uid}-value-${index}`,
    missing: (index: number) => `${uid}-value-${index}-missing`,
    hint: (index: number) => `${uid}-value-${index}-hint`,
  }
  const open = draft && draft.key === key ? draft : null
  const tokens = planTokens(plan)
  const calls = testedCalls(plan)
  const filled = calls.length > 0
  const validated = plan.stores ? data.isApiValidated === true : Boolean(entry?.results)
  const blocked = missingUrls(plan).length > 0 || calls.some((call) => call.problem)

  const focusSoon = (...targets: string[]) => setFocus((current) => ({ targets, seq: (current?.seq ?? 0) + 1 }))
  const focusStatus = () => focusSoon(ids.validate, ids.again, ids.title)

  const start = () => {
    abortRef.current?.abort()
    setDraft({
      key,
      values: initialValues(plan, data),
      methods: Object.fromEntries(plan.calls.flatMap((call): Array<[string, TestMethod]> => (call.choices ? [[call.key, call.method as TestMethod]] : []))),
      missing: [],
      results: null,
      running: false,
    })
    setSaid("")
    focusSoon(tokens.length ? ids.value(0) : ids.run)
  }

  const close = () => {
    abortRef.current?.abort()
    setDraft(null)
    focusStatus()
  }

  const cancel = () => {
    abortRef.current?.abort()
    if (open) setDraft({ ...open, running: false })
    setSaid("Teste cancelado.")
    focusSoon(ids.run)
  }

  const skip = () => {
    abortRef.current?.abort()
    if (plan.stores && data.isApiValidated === true) onPatch(clearedValidation(type))
    remember(key, { skipped: true })
    setDraft(null)
    setSaid("A API segue sem validação.")
    focusSoon(ids.validate)
  }

  const setValue = (name: string, value: string) => {
    if (!open) return
    setDraft({ ...open, values: { ...open.values, [name]: value }, missing: value.trim() ? open.missing.filter((entry) => entry !== name) : open.missing })
  }

  const setMethod = (call: string, method: TestMethod) => {
    if (open) setDraft({ ...open, methods: { ...open.methods, [call]: method } })
  }

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!open || open.running) return
    if (blocked) {
      const missingCall = missingUrls(plan)[0]
      setSaid(missingCall ? "Preencha a URL no campo do componente primeiro." : "Corrija o método HTTP no componente primeiro.")
      if (missingCall) focusSoon(ids.locate(missingCall.key))
      return
    }
    const missing = tokens.filter((token) => !(open.values[token.name] ?? "").trim()).map((token) => token.name)
    if (missing.length) {
      setDraft({ ...open, missing })
      setSaid("Informe um valor de teste para cada variável.")
      focusSoon(ids.value(tokens.findIndex((token) => token.name === missing[0])))
      return
    }
    const startedKey = key
    const values = Object.fromEntries(tokens.map((token) => [token.name, open.values[token.name] ?? ""]))
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setDraft({ ...open, missing: [], results: null, running: true })
    setSaid("Testando a API.")
    if (document.activeElement?.id === ids.retry) focusSoon(ids.run)
    const results: CallResult[] = []
    for (const call of calls) {
      const request = testRequest(call, values, open.methods[call.key] ?? call.method)
      const outcome = await check(request, controller.signal)
      if (controller.signal.aborted) return
      results.push({ key: call.key, label: call.label, method: request.method, outcome })
      if (!outcome.valid) break
    }
    if (abortRef.current === controller) abortRef.current = null
    if (latest.current.key !== startedKey) return
    const failed = results.find((result) => !result.outcome.valid)
    if (failed) {
      remember(startedKey, { ...(entries.get(startedKey)?.skipped ? { skipped: true } : {}), failed: results })
      setDraft({ ...open, values, missing: [], results, running: false })
      setSaid(`API inválida. ${failed.outcome.message}`)
      focusSoon(ids.retry)
      return
    }
    remember(startedKey, { results })
    if (plan.stores) latest.current.onPatch(validationPatch(type, latest.current.data, values))
    setDraft(null)
    const summary = results.map((result) => result.outcome.message).join(" ")
    setSaid(plan.stores ? `API válida. ${summary} A validação foi gravada no componente.` : `API válida. ${summary} O teste vale só nesta sessão.`)
    focusSoon(ids.title)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    if (open.running) cancel()
    else close()
  }

  const renderCall = (call: ApiCall) => {
    const chosen = open?.methods[call.key] ?? call.method
    return (
      <div key={call.key} className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold leading-4 text-flow-muted-strong">{call.label}</p>
        {call.url ? (
          <div className="flex min-w-0 items-start gap-2">
            {call.choices ? (
              <div role="radiogroup" aria-label={`Método do teste: ${call.label}`} className="inline-flex shrink-0 overflow-hidden rounded-md border border-flow-border bg-flow-surface">
                {call.choices.map((method) => (
                  <label key={method} className="cursor-pointer">
                    <input type="radio" className="peer sr-only" name={`${uid}-${call.key}-method`} value={method} checked={chosen === method} disabled={open?.running} onChange={() => setMethod(call.key, method)} />
                    <span className="block px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-4 text-flow-muted-strong transition peer-checked:bg-flow-accent-strong peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-flow-accent/40">
                      {method}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <span className={methodTag}>{call.method || "POST"}</span>
            )}
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-4 text-flow-fg">{call.url}</code>
          </div>
        ) : call.optional ? (
          <p className={cn(ui.hint, "mt-0")}>Não preenchida. Ela é opcional e fica fora do teste.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className={cn(ui.warning, "mt-0")}>Preencha esta URL no campo do componente primeiro.</p>
            {onLocate && <button id={ids.locate(call.key)} type="button" className={ui.linkButton} onClick={() => onLocate(call.key)}>Ir para o campo</button>}
          </div>
        )}
        {call.url && call.problem && <p className={cn(ui.error, "mt-0")}>{call.problem}</p>}
      </div>
    )
  }

  const renderForm = (form: Draft) => {
    const failed = form.results?.some((result) => !result.outcome.valid) ?? false
    return (
      <form aria-labelledby={ids.title} aria-busy={form.running || undefined} noValidate onSubmit={run} className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={ids.title} tabIndex={-1} className="text-xs font-semibold text-flow-fg outline-none">Validar API</h3>
            <p className={cn(ui.hint, "mt-0.5")}>O teste faz uma chamada real à API com os valores informados.</p>
          </div>
          <button type="button" aria-label="Fechar validação" title="Fechar validação" className={closeButton} onClick={close}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-2.5">{plan.calls.map(renderCall)}</div>
        {tokens.length > 0 && (
          <div className="space-y-2.5">
            {tokens.map((token, index) => {
              const missing = form.missing.includes(token.name)
              const hint = VALUE_HINTS[`${type}.${token.name}`]
              const described = [hint && ids.hint(index), missing && ids.missing(index)].filter(Boolean).join(" ")
              return (
                <div key={token.name}>
                  <label htmlFor={ids.value(index)} className={cn(ui.label, "break-words")}>Valor de teste de {token.token}</label>
                  <input
                    id={ids.value(index)}
                    className={cn(ui.input, missing && invalidField)}
                    value={form.values[token.name] ?? ""}
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={form.running}
                    aria-invalid={missing || undefined}
                    aria-describedby={described || undefined}
                    onChange={(event) => setValue(token.name, event.target.value)}
                  />
                  {hint && <p id={ids.hint(index)} className={ui.hint}>{hint}</p>}
                  {missing && <p id={ids.missing(index)} className={ui.error}>Informe um valor de teste.</p>}
                </div>
              )
            })}
          </div>
        )}
        {failed && form.results && <ResultBox valid={false} results={form.results} />}
        <div className="flex flex-wrap items-center gap-2">
          {failed && !form.running ? (
            <>
              <button id={ids.retry} type="submit" className={ui.primaryButton}>Testar de novo</button>
              <button type="button" className={ui.button} onClick={skip}>Usar sem validar</button>
            </>
          ) : (
            <button id={ids.run} type="submit" aria-disabled={form.running || undefined} className={cn(ui.primaryButton, "aria-disabled:opacity-60")}>
              {form.running && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
              {form.running ? "Testando a API" : "Testar API"}
            </button>
          )}
          {form.running ? (
            <button type="button" className={ui.button} onClick={cancel}>Cancelar teste</button>
          ) : (
            !failed && <button type="button" className={ui.button} onClick={close}>Cancelar</button>
          )}
        </div>
      </form>
    )
  }

  const renderStatus = () => {
    const failing = validated && plan.stores ? entry?.failed : undefined
    const passed = validated ? entry?.results : undefined
    const state: { tone: Tone; title: string; text: string } = !filled
      ? { tone: "muted", title: plan.stores ? "API não validada" : "API não testada", text: "Preencha a URL da API no campo do componente para validar." }
      : failing
        ? { tone: "warning", title: "API validada", text: "O último teste falhou. Teste de novo para conferir ou use sem validar." }
        : validated
          ? { tone: "success", title: plan.stores ? "API validada" : "API válida", text: plan.stores ? STORED_NOTE : SESSION_NOTE }
          : entry?.skipped
            ? { tone: "warning", title: "API sem validação", text: "A API segue sem validação. Valide quando quiser." }
            : { tone: "accent", title: "Deseja fazer uma validação?", text: "A API ainda não foi validada. Teste agora para saber se ela responde antes de publicar o fluxo." }
    return (
      <div className="flex gap-2.5">
        {state.tone === "success" ? (
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-flow-success" aria-hidden />
        ) : (
          <span aria-hidden className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", DOTS[state.tone])} />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 id={ids.title} tabIndex={-1} className="text-xs font-semibold text-flow-fg outline-none">{state.title}</h3>
            <p className={cn(ui.hint, "mt-0.5")}>{state.text}</p>
          </div>
          {failing ? <ResultBox valid={false} results={failing} /> : passed && (plan.stores ? <ResultBox valid results={passed} /> : <ResultLines results={passed} />)}
          {filled && (
            <div className="flex flex-wrap items-center gap-2">
              {validated ? (
                <button id={ids.again} type="button" className={ui.button} onClick={start}>Testar de novo</button>
              ) : (
                <button id={ids.validate} type="button" className={entry?.skipped ? ui.button : ui.primaryButton} onClick={start}>Validar API</button>
              )}
              {(failing || (!validated && !entry?.skipped)) && <button type="button" className={ui.button} onClick={skip}>Usar sem validar</button>}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section aria-labelledby={ids.title} className="nokey rounded-lg border border-flow-border bg-flow-soft px-3 py-2.5" onKeyDown={onKeyDown}>
      {open ? renderForm(open) : renderStatus()}
      <p role="status" className="sr-only">{said}</p>
    </section>
  )
}
