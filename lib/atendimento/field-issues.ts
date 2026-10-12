import { mirrorKeys } from "./catalog"
import type { FieldSeverity, FieldSpec, FlowIssue, JsonObject } from "./types"

export interface FieldProblem {
  id: string
  severity: FieldSeverity
  message: string
  fields: string[]
}

export interface ProblemSpot {
  shown: FieldProblem[]
  marked: FieldProblem[]
}

export interface ProblemPlacement {
  fields: Map<string, ProblemSpot>
  technical: Map<string, ProblemSpot>
  loose: FieldProblem[]
}

interface Place {
  field?: string
  technical?: string
}

const OPTION_KEY = /^(opt|text|description)-(\d+)$/
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const keysOf = (field: FieldSpec) => [field.key, ...mirrorKeys(field)]
const inside = (key: string, path: string) => path.startsWith(`${key}.`)
const unique = (keys: string[]) => [...new Set(keys)]

export function pairPattern(field: FieldSpec): RegExp | undefined {
  const keys = (field.itemFields ?? []).map((item) => escapeRegExp(item.key))
  return keys.length ? new RegExp(`^(${keys.join("|")})-(\\d+)$`) : undefined
}

export function indexedPattern(field: FieldSpec): RegExp | undefined {
  if (field.kind === "menuOptions") return OPTION_KEY
  if (field.kind === "conditionPairs") return pairPattern(field)
  return undefined
}

export function technicalKeys(fields: readonly FieldSpec[], data: JsonObject): string[] {
  const primary = new Set(fields.flatMap(keysOf))
  const patterns = fields.flatMap((field) => indexedPattern(field) ?? [])
  return Object.keys(data).filter((key) => !primary.has(key) && !patterns.some((pattern) => pattern.test(key)))
}

function locate(path: string, fields: readonly FieldSpec[], technical: readonly string[]): Place {
  const exact = fields.find((field) => keysOf(field).includes(path) || indexedPattern(field)?.test(path))
  if (exact) return { field: exact.key }
  if (technical.includes(path)) return { technical: path }
  const parent = fields.find((field) => keysOf(field).some((key) => inside(key, path)))
  if (parent) return { field: parent.key }
  const container = technical.find((key) => inside(key, path))
  return container === undefined ? {} : { technical: container }
}

export function placeIssues(fields: readonly FieldSpec[], technical: readonly string[], issues: readonly FlowIssue[], prefix: string): ProblemPlacement {
  const placement: ProblemPlacement = { fields: new Map(), technical: new Map(), loose: [] }
  const fieldOrder = new Map(fields.map((field, index) => [field.key, index]))
  const technicalOrder = new Map(technical.map((key, index) => [key, index]))
  const spot = (spots: Map<string, ProblemSpot>, key: string) => {
    const current = spots.get(key)
    if (current) return current
    const created: ProblemSpot = { shown: [], marked: [] }
    spots.set(key, created)
    return created
  }
  issues.forEach((issue, index) => {
    if (!issue.fields?.length) return
    const problem: FieldProblem = { id: `${prefix}-problem-${index}`, severity: issue.severity, message: issue.message, fields: issue.fields }
    const places = issue.fields.map((path) => locate(path, fields, technical))
    const owners = unique(places.flatMap((place) => place.field ?? [])).sort((a, b) => (fieldOrder.get(a) ?? 0) - (fieldOrder.get(b) ?? 0))
    const extras = unique(places.flatMap((place) => place.technical ?? [])).sort((a, b) => (technicalOrder.get(a) ?? 0) - (technicalOrder.get(b) ?? 0))
    const [spots, keys] = owners.length ? [placement.fields, owners] : [placement.technical, extras]
    if (!keys.length) {
      placement.loose.push(problem)
      return
    }
    for (const key of keys) spot(spots, key).marked.push(problem)
    spot(spots, keys[keys.length - 1]).shown.push(problem)
  })
  return placement
}
