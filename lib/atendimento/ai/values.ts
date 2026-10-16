import { API_TYPES, MENU_TYPE, expectedFieldTypes, getDefinition, mirrorKeys, weekDayOptions } from "../catalog"
import { conditionIndices, optionIndices } from "../format"
import type { ComponentDefinition, FieldSpec, ItemFieldSpec, JsonObject, JsonValue } from "../types"
import { RI_LIMITS } from "./contracts"
import type { RiConfigEntry } from "./ri"
import { clip, foldText, listQuoted, parseJsonText, quote } from "./text"

export type NoteLevel = "error" | "warning" | "hint"

export interface ValueNote {
  level: NoteLevel
  message: string
}

export interface ConfigContext {
  ruleId: () => string
  edit?: boolean
}

export type ListKind = "menuOptions" | "conditionPairs"

export interface ListSize {
  key: string
  kind: ListKind
  count: number
  max: number
}

export interface ConfigOutcome {
  data: JsonObject
  notes: ValueNote[]
  menuTarget?: string
}

interface NumberRule {
  integer: boolean
  min?: number
  max?: number
}

interface TypeKeys {
  fields: Map<string, FieldSpec>
  folded: Map<string, string>
  fixed: Set<string>
  silent: Set<string>
  indexed: Array<{ field: FieldSpec; pattern: RegExp }>
  listed: string[]
}

type Parsed = { ok: true; value: unknown } | { ok: false }

const COMPUTED_KEYS = ["curl", "isApiValidated", "validated_signature", "parsed_body", "parameterExplanations", "availableNodes", "targetNodeName"]
const INDEXED_PATTERNS: Partial<Record<FieldSpec["kind"], RegExp>> = {
  menuOptions: /^(opt|text|description)-(\d+)$/i,
  conditionPairs: /^(var|value)-(\d+)$/i,
}
const TRUE_WORDS = new Set(["true", "sim", "yes", "1", "verdadeiro", "on", "ativo", "ativado"])
const FALSE_WORDS = new Set(["false", "nao", "no", "0", "falso", "off", "inativo", "desativado"])
const DAY_ORDER = weekDayOptions.map((day) => day.value)
const WORK_DAYS = DAY_ORDER.slice(0, 5)
const WEEKEND = DAY_ORDER.slice(5)
const DAY_NAMES = new Map<string, string>([
  ...["monday", "mon", "segunda", "seg", "2a"].map((name) => [name, "monday"] as const),
  ...["tuesday", "tue", "tues", "terca", "ter", "3a"].map((name) => [name, "tuesday"] as const),
  ...["wednesday", "wed", "quarta", "qua", "4a"].map((name) => [name, "wednesday"] as const),
  ...["thursday", "thu", "thurs", "quinta", "qui", "5a"].map((name) => [name, "thursday"] as const),
  ...["friday", "fri", "sexta", "sex", "6a"].map((name) => [name, "friday"] as const),
  ...["saturday", "sat", "sabado", "sab"].map((name) => [name, "saturday"] as const),
  ...["sunday", "sun", "domingo", "dom"].map((name) => [name, "sunday"] as const),
])
const DAY_GROUPS = new Map<string, string[]>([
  ...["todos", "todos os dias", "diariamente", "todo dia", "every day", "everyday", "daily", "all"].map((name) => [name, DAY_ORDER] as const),
  ...["dias uteis", "uteis", "weekdays", "segunda a sexta"].map((name) => [name, WORK_DAYS] as const),
  ...["fim de semana", "fins de semana", "weekend", "weekends"].map((name) => [name, WEEKEND] as const),
])
const ITEM_ALIASES: Record<string, string[]> = {
  name: ["name", "nome", "label", "title", "titulo"],
  when: ["when", "quando", "condition", "condicao", "description", "descricao"],
  requireFields: ["requireFields", "exigirCampos", "require"],
  header: ["header", "coluna", "column", "name", "nome", "title", "titulo"],
  value: ["value", "valor"],
  label: ["label", "name", "nome", "caminho", "title", "titulo"],
  weight: ["weight", "peso", "percent", "percentual", "porcentagem"],
}
const MIME_TYPES = new Map([
  ["pdf", "application/pdf"],
  ["ogg", "audio/ogg"],
  ["opus", "audio/ogg"],
  ["oga", "audio/ogg"],
  ["mp3", "audio/mpeg"],
  ["m4a", "audio/mp4"],
  ["aac", "audio/aac"],
  ["wav", "audio/wav"],
  ["mp4", "video/mp4"],
  ["3gp", "video/3gpp"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["csv", "text/csv"],
  ["txt", "text/plain"],
  ["zip", "application/zip"],
])
const RESPONSE_ALIASES = {
  path: ["path", "caminho", "campo", "jsonPath", "field"],
  key: ["key", "chave"],
  sample: ["sample", "exemplo"],
  variable: ["variable", "variavel", "var"],
}
const RESPONSE_KEYS = new Set(Object.values(RESPONSE_ALIASES).flat().map((name) => name.toLowerCase()))
const VARIABLE_KEYS = new Set(["variable", "variableName", "varPrefix", "condicional_api.key"])
const STRICT_VARIABLES = new Set(["webchatHandoff.outputVar"])
const VARIABLE_TEXT = /^[^\s{}"'`<>@#]+$/
const STRICT_VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/

const keyCache = new Map<string, TypeKeys>()

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function keysOf(definition: ComponentDefinition): TypeKeys {
  const type = definition.nativeType ?? definition.id
  const cached = keyCache.get(type)
  if (cached) return cached
  const fields = new Map<string, FieldSpec>()
  const fixed = new Set<string>()
  const silent = new Set<string>(COMPUTED_KEYS)
  const indexed: TypeKeys["indexed"] = []
  for (const field of definition.fields ?? []) {
    for (const mirror of mirrorKeys(field)) silent.add(mirror)
    if (field.kind === "select" && (field.options ?? []).length < 2) {
      fixed.add(field.key)
      continue
    }
    fields.set(field.key, field)
    const pattern = INDEXED_PATTERNS[field.kind]
    if (pattern) indexed.push({ field, pattern })
  }
  for (const key of fields.keys()) silent.delete(key)
  const folded = new Map<string, string>()
  for (const key of fields.keys()) folded.set(key.toLowerCase(), key)
  const keys = { fields, folded, fixed, silent, indexed, listed: [...fields.keys()] }
  keyCache.set(type, keys)
  return keys
}

export function acceptedKeys(type: string): string[] {
  const definition = getDefinition(type)
  return definition ? [...keysOf(definition).listed] : []
}

export function fixedKeys(type: string): string[] {
  const definition = getDefinition(type)
  return definition ? [...keysOf(definition).fixed] : []
}

export function toText(raw: string): string {
  let text = raw
  const trimmed = text.trim()
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    const parsed = parseJsonText(trimmed)
    if (parsed.ok && typeof parsed.value === "string") text = parsed.value
  }
  text = text.replace(/\r\n?/g, "\n")
  if (!text.includes("\n") && text.includes("\\n")) text = text.replace(/\\n/g, "\n")
  return text.replace(/[ \t]+\n/g, "\n").trim()
}

export function slugOf(text: string, limit = 60): string {
  return foldText(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, limit).replace(/-+$/, "")
}

export function booleanOf(raw: string): boolean | undefined {
  const key = foldText(toText(raw))
  if (TRUE_WORDS.has(key)) return true
  if (FALSE_WORDS.has(key)) return false
  return undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function toUrl(raw: string): string | undefined {
  const text = toText(raw)
  if (/\s/.test(text)) return undefined
  if (isHttpUrl(text)) return text
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(text) && isHttpUrl(`https://${text}`)) return `https://${text}`
  return undefined
}

function numberToken(raw: string): { text: string; value: number } | undefined {
  let text = toText(raw).replace(/^r\$\s*/i, "").replace(/\s+/g, "").replace(/%$/, "")
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".")
  else if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".")
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(text)) return undefined
  text = text.replace(/^(-?)\./, (_, sign: string) => `${sign}0.`)
  const value = Number(text)
  return Number.isFinite(value) ? { text, value } : undefined
}

function ruleOf(spec: { step?: number; min?: number; max?: number }): NumberRule {
  return { integer: spec.step !== undefined && Number.isInteger(spec.step), min: spec.min, max: spec.max }
}

function fits(value: number, rule: NumberRule): boolean {
  if (rule.integer && !Number.isInteger(value)) return false
  if (rule.min !== undefined && value < rule.min) return false
  return rule.max === undefined || value <= rule.max
}

export function describeNumberRule(rule: NumberRule): string {
  const parts = [rule.integer ? "um número inteiro" : "um número"]
  if (rule.min !== undefined) parts.push(`a partir de ${rule.min}`)
  if (rule.max !== undefined) parts.push(`até ${rule.max}`)
  return parts.join(" ")
}

function parseLoose(raw: string): Parsed {
  const first = parseJsonText(raw)
  if (first.ok && typeof first.value === "string") {
    const inner = first.value.trim()
    if (/^[[{]/.test(inner)) {
      const second = parseJsonText(inner)
      if (second.ok) return second
    }
  }
  return first
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === undefined || value === null) return ""
  return JSON.stringify(value)
}

function pickValue(item: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (item[key] !== undefined) return item[key]
  const folded = new Map(Object.keys(item).map((key) => [key.toLowerCase(), key]))
  for (const key of keys) {
    const actual = folded.get(key.toLowerCase())
    if (actual !== undefined) return item[actual]
  }
  return undefined
}

function lines(text: string): string[] {
  return toText(text)
    .split("\n")
    .map((line) => line.replace(/^\s*(\d{1,2}|[a-z])\s*[-.):]\s+/i, "").replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
}

function entriesOf(raw: string): { list?: unknown[]; map?: Record<string, unknown> } {
  const parsed = parseLoose(raw)
  if (parsed.ok) {
    if (Array.isArray(parsed.value)) return { list: parsed.value }
    if (isRecord(parsed.value)) return { map: parsed.value }
    if (typeof parsed.value === "string") return { list: lines(parsed.value) }
    return {}
  }
  const found = lines(raw)
  return found.length ? { list: found } : {}
}

export function cleanVariable(text: string): string {
  let value = text.trim().replace(/^@@@/, "").replace(/^#(?!NAME$)/, "")
  const braces = /^\{\{\s*([^{}]*?)\s*\}\}$/.exec(value)
  if (braces) value = braces[1]
  return value.replace(/\s+/g, "_")
}

function isVariableField(type: string, key: string): boolean {
  return /Var$/.test(key) || VARIABLE_KEYS.has(key) || VARIABLE_KEYS.has(`${type}.${key}`)
}

function dayOf(token: string): string | undefined {
  const key = foldText(token).replace(/[-\s]?feira$/, "").replace(/\.$/, "").trim()
  return DAY_NAMES.get(key)
}

function expandDays(from: string, to: string): string[] {
  const start = DAY_ORDER.indexOf(from)
  const end = DAY_ORDER.indexOf(to)
  const days: string[] = []
  for (let index = start; ; index = (index + 1) % DAY_ORDER.length) {
    days.push(DAY_ORDER[index])
    if (index === end || days.length === DAY_ORDER.length) return days
  }
}

export function daysOf(value: unknown): string[] | undefined {
  const tokens = Array.isArray(value) ? value.map((entry) => textOf(entry)) : typeof value === "string" ? [value] : []
  if (!tokens.length) return undefined
  const result = new Set<string>()
  for (const token of tokens) {
    const whole = DAY_GROUPS.get(foldText(token))
    if (whole) {
      whole.forEach((day) => result.add(day))
      continue
    }
    const pieces = foldText(token).replace(/[-\s]feira\b/g, "").split(/\s*(?:,|;|\/|\be\b|\band\b)\s*/)
    for (const piece of pieces) {
      if (!piece) continue
      const group = DAY_GROUPS.get(piece)
      if (group) {
        group.forEach((day) => result.add(day))
        continue
      }
      const range = /^(.+?)\s*(?:\ba\b|\bate\b|\bto\b|-)\s*(.+)$/.exec(piece)
      const day = dayOf(piece)
      if (day) result.add(day)
      else if (range) {
        const from = dayOf(range[1])
        const to = dayOf(range[2])
        if (!from || !to) return undefined
        expandDays(from, to).forEach((entry) => result.add(entry))
      } else return undefined
    }
  }
  return DAY_ORDER.filter((day) => result.has(day))
}

export function timeOf(value: unknown): string | undefined {
  const text = typeof value === "number" && Number.isInteger(value) ? String(value) : typeof value === "string" ? foldText(value).replace(/\s+/g, "") : ""
  const match = /^(\d{1,2})(?:(?::|h|\.)(\d{2})?)?(?::\d{2})?(?:min|h|hs|hrs|horas)?$/.exec(text)
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = match[2] === undefined ? 0 : Number(match[2])
  if (hours === 24 && minutes === 0) return "23:59"
  if (hours > 23 || minutes > 59) return undefined
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function timeRulesOf(raw: string, context: ConfigContext, notes: ValueNote[]): JsonObject[] | undefined {
  const parsed = parseLoose(raw)
  if (!parsed.ok) return undefined
  const items = Array.isArray(parsed.value) ? parsed.value : isRecord(parsed.value) ? [parsed.value] : []
  if (!items.length) return undefined
  const rules: JsonObject[] = []
  for (const item of items) {
    if (!isRecord(item)) return undefined
    const weekDays = daysOf(pickValue(item, ["weekDays", "days", "dias", "diasDaSemana", "weekdays"]))
    const startTime = timeOf(pickValue(item, ["startTime", "start", "inicio", "from", "de", "abertura"]))
    const endTime = timeOf(pickValue(item, ["endTime", "end", "fim", "to", "ate", "fechamento"]))
    if (!weekDays || !weekDays.length || !startTime || !endTime) return undefined
    if (endTime === "00:00") {
      rules.push({ id: context.ruleId(), weekDays, startTime, endTime: "23:59" })
      notes.push({ level: "hint", message: `A regra das ${startTime} às 00:00 passou a terminar às 23:59.` })
      continue
    }
    if (startTime === endTime) {
      rules.push({ id: context.ruleId(), weekDays, startTime, endTime })
      notes.push({ level: "warning", message: `A regra das ${startTime} às ${endTime} começa e termina no mesmo horário; informe o horário de fim.` })
      continue
    }
    if (startTime < endTime) {
      rules.push({ id: context.ruleId(), weekDays, startTime, endTime })
      continue
    }
    const following = DAY_ORDER.filter((day) => weekDays.includes(DAY_ORDER[(DAY_ORDER.indexOf(day) + DAY_ORDER.length - 1) % DAY_ORDER.length]))
    rules.push({ id: context.ruleId(), weekDays, startTime, endTime: "23:59" }, { id: context.ruleId(), weekDays: following, startTime: "00:00", endTime })
    notes.push({ level: "hint", message: `A regra das ${startTime} às ${endTime} passa da meia-noite e foi dividida em duas: ${startTime} às 23:59 e 00:00 às ${endTime} do dia seguinte.` })
  }
  return rules
}

function menuOptionsOf(raw: string): Array<{ text: string; description: string }> | undefined {
  const { list, map } = entriesOf(raw)
  const items = list ?? (map && Array.isArray(map.options) ? map.options : map ? Object.values(map) : undefined)
  if (!items) return undefined
  const options = items.map((item) => {
    if (!isRecord(item)) return { text: textOf(item), description: "" }
    return {
      text: textOf(pickValue(item, ["text", "title", "titulo", "label", "name", "nome", "option", "opcao", "texto"])),
      description: textOf(pickValue(item, ["description", "descricao", "desc", "detail", "detalhe"])),
    }
  })
  return options.length ? options : undefined
}

function conditionsOf(raw: string): Array<{ variable: string; value: string }> | undefined {
  const { list, map } = entriesOf(raw)
  const items: Array<{ variable: string; value: string }> = []
  if (map) for (const [key, value] of Object.entries(map)) items.push({ variable: key, value: textOf(value) })
  for (const item of list ?? []) {
    if (isRecord(item)) {
      items.push({
        variable: textOf(pickValue(item, ["var", "variable", "variavel", "key", "chave", "name", "nome", "field", "campo"])),
        value: textOf(pickValue(item, ["value", "valor", "equals", "igual"])),
      })
      continue
    }
    const text = textOf(item)
    const split = /^(.*?)\s*(?:==|=|:)\s*(.*)$/.exec(text)
    items.push(split ? { variable: split[1], value: split[2] } : { variable: text, value: "" })
  }
  return items.length ? items.map((item) => ({ variable: cleanVariable(item.variable), value: item.value })) : undefined
}

function letter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}

export function balanceWeights(weights: ReadonlyArray<number | undefined>): number[] {
  const count = weights.length
  if (!count) return []
  const known = weights.map((weight) => (weight !== undefined && Number.isFinite(weight) && weight >= 0 ? weight : undefined))
  const missing = known.filter((weight) => weight === undefined).length
  const given = known.reduce<number>((sum, weight) => sum + (weight ?? 0), 0)
  let filled: number[]
  if (missing) {
    const rest = Math.max(0, 100 - given)
    const share = Math.floor(rest / missing)
    let left = missing
    filled = known.map((weight) => {
      if (weight !== undefined) return weight
      left--
      return left === 0 ? rest - share * (missing - 1) : share
    })
  } else filled = known.map((weight) => weight ?? 0)
  const total = filled.reduce((sum, weight) => sum + weight, 0)
  if (Math.abs(total - 100) < 1e-9) return filled
  if (total <= 0) return filled.map((_, index) => (index === count - 1 ? 100 - Math.floor(100 / count) * (count - 1) : Math.floor(100 / count)))
  const exact = filled.map((weight) => (weight * 100) / total)
  const result = exact.map(Math.floor)
  let remainder = 100 - result.reduce((sum, weight) => sum + weight, 0)
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index]++
    remainder--
  }
  return result
}

function pathsOf(raw: string): JsonObject[] | undefined {
  const { list, map } = entriesOf(raw)
  const items: Array<{ label: string; weight?: number }> = []
  if (map) for (const [key, value] of Object.entries(map)) items.push({ label: key, weight: numberToken(textOf(value))?.value })
  for (const item of list ?? []) {
    if (isRecord(item)) {
      const weight = pickValue(item, ITEM_ALIASES.weight)
      items.push({ label: textOf(pickValue(item, ITEM_ALIASES.label)), weight: weight === undefined ? undefined : numberToken(textOf(weight))?.value })
    } else items.push({ label: textOf(item) })
  }
  if (items.length < 2) return undefined
  const weights = balanceWeights(items.map((item) => item.weight))
  return items.map((item, index) => ({ label: item.label || `Caminho ${letter(index)}`, weight: weights[index] }))
}

function itemBase(field: FieldSpec): JsonObject {
  if (field.newItem) return JSON.parse(JSON.stringify(field.newItem)) as JsonObject
  const base: JsonObject = {}
  for (const item of field.itemFields ?? []) base[item.key] = item.kind === "checkbox" ? false : item.kind === "number" ? 0 : ""
  return base
}

function itemValue(spec: ItemFieldSpec, value: unknown, fallback: JsonValue): JsonValue {
  if (value === undefined || value === null) return fallback
  if (spec.kind === "checkbox") return typeof value === "boolean" ? value : booleanOf(textOf(value)) ?? fallback
  if (spec.kind === "number") {
    const token = typeof value === "number" ? { value } : numberToken(textOf(value))
    return token && fits(token.value, ruleOf(spec)) ? token.value : fallback
  }
  return textOf(value)
}

function objectListOf(field: FieldSpec, raw: string, notes: ValueNote[]): JsonObject[] | undefined {
  const specs = field.itemFields ?? []
  if (!specs.length) return undefined
  const { list, map } = entriesOf(raw)
  const sources: Array<Record<string, unknown>> = []
  if (map) {
    const nested = Object.values(map).every(isRecord)
    for (const [key, value] of Object.entries(map)) {
      if (nested && isRecord(value)) sources.push({ [specs[0].key]: key, ...value })
      else sources.push({ [specs[0].key]: key, ...(specs[1] ? { [specs[1].key]: value } : {}) })
    }
  }
  for (const item of list ?? []) sources.push(isRecord(item) ? item : { [specs[0].key]: item })
  if (!sources.length) return undefined
  const items = sources.map((source) => {
    const item = itemBase(field)
    for (const spec of specs) item[spec.key] = itemValue(spec, pickValue(source, ITEM_ALIASES[spec.key] ?? [spec.key]), item[spec.key] ?? "")
    return item
  })
  if (field.key === "columns" && items.some((item) => !textOf(item.value))) {
    notes.push({ level: "warning", message: "Cada coluna de columns precisa de header e value; use {{variavel}} no value." })
  }
  return items
}

const pathLike = (candidate: string) => /[.[]/.test(candidate)
const responseKeysOnly = (value: Record<string, unknown>) => Object.keys(value).every((name) => RESPONSE_KEYS.has(name.toLowerCase()))

function responseMapOf(value: Record<string, unknown>): unknown {
  const names = Object.keys(value).map((name) => name.toLowerCase())
  const has = (aliases: readonly string[]) => aliases.some((alias) => names.includes(alias.toLowerCase()))
  if (!names.length || responseKeysOnly(value) || (has(RESPONSE_ALIASES.path) && has(RESPONSE_ALIASES.variable))) return [value]
  const items: unknown[] = []
  const walk = (name: string, entry: unknown): boolean => {
    if (typeof entry === "string") {
      items.push(pathLike(entry) || !pathLike(name) ? { path: entry, variable: name } : { path: name, variable: entry })
      return true
    }
    if (!isRecord(entry) || !Object.keys(entry).length) return false
    if (responseKeysOnly(entry)) {
      items.push({ variable: name, ...entry })
      return true
    }
    return Object.entries(entry).every(([key, inner]) => walk(`${name}.${key}`, inner))
  }
  return Object.entries(value).every(([name, entry]) => walk(name, entry)) ? items : [value]
}

function jsonOf(type: string, key: string, raw: string, notes: ValueNote[]): JsonValue | undefined {
  const expected = expectedFieldTypes(type, key)?.[0]
  const parsed = parseLoose(raw)
  if (key === "selectedIds") {
    const value = parsed.ok ? parsed.value : toText(raw)
    const list = Array.isArray(value) ? value : typeof value === "string" || typeof value === "number" ? String(value).split(/[,;\n]/) : undefined
    return list?.map((entry) => textOf(entry)).filter(Boolean)
  }
  if (!parsed.ok) return undefined
  let value = parsed.value
  if (key === "response_map" && isRecord(value)) value = responseMapOf(value)
  if (expected === "array" && isRecord(value)) value = [value]
  if (expected === "array" && !Array.isArray(value)) return undefined
  if (expected === "object" && !isRecord(value)) return undefined
  if (key === "response_map" && Array.isArray(value)) {
    if (!value.every(isRecord)) return undefined
    const items = value.map((entry) => ({
      path: textOf(pickValue(entry, RESPONSE_ALIASES.path)),
      key: textOf(pickValue(entry, RESPONSE_ALIASES.key)),
      sample: textOf(pickValue(entry, RESPONSE_ALIASES.sample)),
      variable: cleanVariable(textOf(pickValue(entry, RESPONSE_ALIASES.variable))),
    }))
    if (items.some((item) => !item.path || !item.variable)) notes.push({ level: "warning", message: "Cada item de response_map precisa de path e variable." })
    return items
  }
  return value as JsonValue
}

function optionsText(field: FieldSpec): string {
  return (field.options ?? [])
    .filter((option) => option.value !== "")
    .map((option) => (option.label && option.label !== option.value ? `${quote(option.value)} (${option.label})` : quote(option.value)))
    .join(", ")
}

export function matchOption(field: FieldSpec, raw: string, type: string): string | undefined {
  const options = field.options ?? []
  const text = toText(raw)
  const exact = options.find((option) => option.value === text)
  if (exact) return exact.value
  const key = foldText(text)
  const found = options.find((option) => foldText(option.value) === key) ?? options.find((option) => foldText(option.label) === key)
  if (found) return found.value
  const flag = booleanOf(text)
  if (flag !== undefined) {
    const option = options.find((entry) => entry.value === String(flag))
    if (option) return option.value
  }
  if (type === "waiting_time") {
    const delay = /^(\d+)\s*(ms|s|seg|segundos?|min|minutos?)?$/.exec(key)
    if (delay) {
      const amount = Number(delay[1])
      const unit = delay[2] ?? (amount >= 1000 ? "ms" : "s")
      const millis = unit === "ms" ? amount : unit.startsWith("min") ? amount * 60000 : amount * 1000
      const option = options.find((entry) => entry.value === String(millis))
      if (option) return option.value
    }
  }
  return undefined
}

function invalidValue(raw: string, field: FieldSpec, accepted: string): string {
  return `O valor ${quote(clip(toText(raw), 80))} não vale para ${quote(field.label)} (${field.key}) e o padrão foi mantido. Use ${accepted}.`
}

function writeIndexed(data: JsonObject, rows: ReadonlyArray<Record<string, string>>): void {
  rows.forEach((row, index) => {
    for (const [part, value] of Object.entries(row)) data[`${part}-${index + 1}`] = value
  })
}

function indexedRows(parts: Map<number, Map<string, string>>): Array<Map<string, string>> {
  return [...parts.entries()].sort(([a], [b]) => a - b).map(([, row]) => row)
}

export function configureNode(type: string, config: readonly RiConfigEntry[], context: ConfigContext): ConfigOutcome {
  const definition = getDefinition(type)
  if (!definition?.defaults) throw new Error(`O componente “${type}” não existe no catálogo.`)
  const keys = keysOf(definition)
  const notes: ValueNote[] = []
  const values = new Map<string, string>()
  const indexed = new Map<string, Map<number, Map<string, string>>>()
  const unknown: string[] = []
  let entries = config
  if (entries.length > RI_LIMITS.configEntries) {
    notes.push({ level: "hint", message: `Só os primeiros ${RI_LIMITS.configEntries} pares de config foram usados.` })
    entries = entries.slice(0, RI_LIMITS.configEntries)
  }
  for (const entry of entries) {
    const key = String(entry.key ?? "").trim()
    const value = String(entry.value ?? "")
    const canonical = keys.fields.has(key) ? key : keys.folded.get(key.toLowerCase())
    if (canonical) {
      values.set(canonical, value)
      continue
    }
    const slot = keys.indexed.find(({ pattern }) => pattern.test(key))
    if (slot) {
      const match = slot.pattern.exec(key)
      if (match) {
        const rows = indexed.get(slot.field.key) ?? new Map<number, Map<string, string>>()
        const row = rows.get(Number(match[2])) ?? new Map<string, string>()
        row.set(match[1].toLowerCase(), value)
        rows.set(Number(match[2]), row)
        indexed.set(slot.field.key, rows)
      }
      continue
    }
    if (keys.fixed.has(key) || keys.silent.has(key) || !key) continue
    if (!unknown.includes(key)) unknown.push(key)
  }
  if (unknown.length) {
    const subject = unknown.length === 1 ? `A chave ${quote(unknown[0])} não existe e foi descartada.` : `As chaves ${listQuoted(unknown)} não existem e foram descartadas.`
    notes.push({ level: "warning", message: `${subject} ${keys.listed.length ? `Chaves aceitas: ${keys.listed.join(", ")}.` : "Este componente não tem chaves."}` })
  }

  const filled = [...values.values()].some((value) => value.trim() !== "") || indexed.size > 0
  const alwaysConfigured = (definition.fields ?? []).some((field) => field.kind === "menuNode")
  const data = definition.configured && (filled || alwaysConfigured) ? definition.configured() : definition.defaults()
  let menuTarget: string | undefined

  for (const field of definition.fields ?? []) {
    if (keys.fixed.has(field.key)) continue
    const raw = values.get(field.key)
    const rows = indexed.get(field.key)
    if ((raw === undefined || raw.trim() === "") && !rows) continue
    const source = raw ?? ""
    const set = (value: JsonValue) => {
      data[field.key] = value
      for (const mirror of mirrorKeys(field)) data[mirror] = value
    }
    const reject = (accepted: string) => notes.push({ level: "warning", message: invalidValue(source, field, accepted) })
    switch (field.kind) {
      case "text":
      case "textarea": {
        let text = toText(source)
        if (isVariableField(type, field.key)) {
          const variable = cleanVariable(text)
          const strict = STRICT_VARIABLES.has(`${type}.${field.key}`)
          if (!(strict ? STRICT_VARIABLE : VARIABLE_TEXT).test(variable)) reject(strict ? "só letras, números e _, começando por letra ou _" : "só letras, números e _, sem espaços e sem {{ }}")
          else set(variable)
          break
        }
        if (text.length > RI_LIMITS.value) {
          notes.push({ level: "hint", message: `O valor de ${field.key} passou de ${RI_LIMITS.value} caracteres e foi cortado.` })
          text = text.slice(0, RI_LIMITS.value).trim()
        }
        set(text)
        break
      }
      case "url": {
        const url = toUrl(source)
        if (url === undefined) notes.push({ level: "warning", message: `O valor ${quote(clip(toText(source), 80))} de ${quote(field.label)} (${field.key}) não é uma URL http(s) e foi descartado.` })
        else set(url)
        break
      }
      case "select": {
        const option = matchOption(field, source, type)
        if (option === undefined) reject(optionsText(field))
        else set(option)
        break
      }
      case "checkbox": {
        const flag = booleanOf(source)
        if (flag === undefined) reject("“true” ou “false”")
        else set(flag)
        break
      }
      case "number": {
        const rule = ruleOf(field)
        const token = numberToken(source)
        if (!token || !fits(token.value, rule)) reject(describeNumberRule(rule))
        else set(token.value)
        break
      }
      case "numberText": {
        const rule = ruleOf(field)
        const token = numberToken(source)
        if (!token || !fits(token.value, rule)) reject(describeNumberRule(rule))
        else set(rule.integer ? String(token.value) : token.text)
        break
      }
      case "json": {
        const value = jsonOf(type, field.key, source, notes)
        const expected = expectedFieldTypes(type, field.key)?.[0] === "object" ? "um objeto JSON" : "uma lista JSON"
        if (value === undefined) reject(expected)
        else set(value)
        break
      }
      case "timeRules": {
        const rules = timeRulesOf(source, context, notes)
        if (!rules) reject("uma lista JSON de regras {\"weekDays\":[\"monday\"],\"startTime\":\"08:00\",\"endTime\":\"18:00\"}")
        else set(rules)
        break
      }
      case "menuOptions": {
        let options = raw !== undefined && raw.trim() !== "" ? menuOptionsOf(source) : undefined
        if (!options && rows) options = indexedRows(rows).map((row) => ({ text: textOf(row.get("text")), description: textOf(row.get("description")) }))
        if (!options) {
          reject("uma lista JSON de opções {\"text\",\"description\"}")
          break
        }
        const limit = field.max ?? RI_LIMITS.menuOptions
        if (options.length > limit && !context.edit) {
          notes.push({ level: "warning", message: `O menu aceita até ${limit} opções; ${options.length - limit} foram descartadas.` })
          options = options.slice(0, limit)
        }
        writeIndexed(data, options.map((option, index) => ({ opt: String(index + 1), text: option.text, description: option.description })))
        break
      }
      case "conditionPairs": {
        let pairs = raw !== undefined && raw.trim() !== "" ? conditionsOf(source) : undefined
        if (!pairs && rows) pairs = indexedRows(rows).map((row) => ({ variable: cleanVariable(textOf(row.get("var"))), value: textOf(row.get("value")) }))
        if (!pairs) {
          reject("uma lista JSON de condições {\"var\",\"value\"}")
          break
        }
        const limit = field.max ?? RI_LIMITS.conditions
        if (pairs.length > limit && !context.edit) {
          notes.push({ level: "warning", message: `A Múltipla Condição aceita até ${limit} condições; ${pairs.length - limit} foram descartadas.` })
          pairs = pairs.slice(0, limit)
        }
        writeIndexed(data, pairs.map((pair) => ({ var: pair.variable, value: pair.value })))
        break
      }
      case "weightedPaths": {
        const paths = pathsOf(source)
        if (!paths) reject("uma lista JSON com ao menos dois caminhos {\"label\",\"weight\"}")
        else set(paths)
        break
      }
      case "objectList": {
        const items = objectListOf(field, source, notes)
        if (!items) reject(`uma lista JSON de itens {${(field.itemFields ?? []).map((item) => `"${item.key}"`).join(",")}}`)
        else set(items)
        break
      }
      case "menuNode":
        menuTarget = toText(source)
        break
    }
  }
  return { data, notes, menuTarget }
}

function fileName(address: unknown): string {
  if (typeof address !== "string" || !address) return ""
  try {
    const segment = new URL(address).pathname.split("/").filter(Boolean).pop() ?? ""
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  } catch {
    return ""
  }
}

export function mimeOf(name: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  return extension ? MIME_TYPES.get(extension) ?? "" : ""
}

export function buildCurl(data: JsonObject): string {
  const url = String(data.url_api ?? "")
  const body = String(data.body_value ?? "")
  return `curl -X ${String(data.method || "POST")} '${url}'${body ? ` \\\n  -d '${body}'` : ""}`
}

const filledText = (value: unknown): value is string => typeof value === "string" && value.trim() !== ""

export function settleData(type: string, data: JsonObject): void {
  if (API_TYPES.has(type) && has(data, "curl")) {
    data.curl = buildCurl(data)
    data.isApiValidated = false
    data.validated_signature = ""
  }
  if (type === "envio_arquivo") {
    if (!filledText(data.filename)) data.filename = fileName(data.url)
    if (!filledText(data.mime_type) && filledText(data.filename)) data.mime_type = mimeOf(data.filename)
  }
  if (type === "envio_imagem" && !filledText(data.filename)) data.filename = fileName(filledText(data.imagem) ? data.imagem : data.url)
  if (type === MENU_TYPE && data.buttons === "true" && optionIndices(data).length > 3) data.buttons = "false"
  if (type === "webchatHandoff" && filledText(data.message) && !data.message.includes("{{link}}")) data.message = `${data.message}\n{{link}}`
}

const listIndices = (kind: ListKind, data: JsonObject) => (kind === "menuOptions" ? optionIndices(data) : conditionIndices(data))

export function listSizes(type: string, data: JsonObject): ListSize[] {
  const sizes: ListSize[] = []
  for (const field of getDefinition(type)?.fields ?? []) {
    if (field.kind !== "menuOptions" && field.kind !== "conditionPairs") continue
    const max = field.max ?? (field.kind === "menuOptions" ? RI_LIMITS.menuOptions : RI_LIMITS.conditions)
    sizes.push({ key: field.key, kind: field.kind, count: listIndices(field.kind, data).length, max })
  }
  return sizes
}

export function trimList(data: JsonObject, kind: ListKind, keep: number): string[] {
  const cut = listIndices(kind, data).slice(Math.max(0, keep))
  if (!cut.length) return []
  const labels = cut.map((index, position) => {
    if (kind === "conditionPairs") return `${textOf(data[`var-${index}`])} = ${textOf(data[`value-${index}`])}`
    return textOf(data[`text-${index}`]) || `Opção ${keep + position + 1}`
  })
  const removed = new Set(cut)
  const pattern = INDEXED_PATTERNS[kind]
  for (const key of Object.keys(data)) {
    const match = pattern?.exec(key)
    if (match && removed.has(Number(match[2]))) delete data[key]
  }
  return labels
}
