import { z } from "zod"
import { componentCatalog } from "../catalog"
import type { ProviderId } from "./providers"
import { compactKey, parseJsonText, sliceObject } from "./text"

export interface RiConfigEntry {
  key: string
  value: string
}

export interface RiNode {
  id: string
  type: string
  config: RiConfigEntry[]
}

export interface RiEdge {
  from: string
  output: string
  to: string
}

export interface RiFlow {
  name: string
  description: string
  nodes: RiNode[]
  edges: RiEdge[]
}

export const RI_TYPES = componentCatalog.map((definition) => definition.nativeType ?? definition.id) as [string, ...string[]]

export const RI_SCHEMA_NAME = "fluxo_ri"
export const RI_SCHEMA_DESCRIPTION = "Representação intermediária de um fluxo de atendimento"

export const riSchema: z.ZodType<RiFlow> = z.object({
  name: z.string().describe("Nome curto do fluxo"),
  description: z.string().describe("Resumo do fluxo em uma frase"),
  nodes: z
    .array(
      z.object({
        id: z.string().describe("ID curto e único na RI, por exemplo menu_principal"),
        type: z.enum(RI_TYPES).describe("Tipo do componente"),
        config: z
          .array(
            z.object({
              key: z.string().describe("Chave do componente"),
              value: z.string().describe("Texto puro, ou JSON em texto para listas, objetos, números e booleanos"),
            }),
          )
          .describe("Configuração do componente em pares key e value"),
      }),
    )
    .describe("Componentes do fluxo, sem o Iniciar Fluxo"),
  edges: z
    .array(
      z.object({
        from: z.string().describe("ID de origem na RI; inicio é o Iniciar Fluxo"),
        output: z.string().describe("Rótulo da saída, número da saída a partir de 1, ou vazio quando há uma só saída"),
        to: z.string().describe("ID de destino na RI"),
      }),
    )
    .describe("Conexões entre os componentes"),
})

export const RI_PROVIDER_OPTIONS: Readonly<Record<ProviderId, Readonly<Record<string, Readonly<Record<string, string | boolean>>>>>> = {
  openai: { openai: { strictJsonSchema: true, store: false } },
  anthropic: { anthropic: { structuredOutputMode: "outputFormat" } },
  google: { google: { structuredOutputs: true } },
  xai: { xai: { store: false } },
}

const TYPE_ALIASES = (() => {
  const owners = new Map<string, Set<string>>()
  for (const definition of componentCatalog) {
    const type = definition.nativeType ?? definition.id
    for (const alias of [type, definition.id, definition.label]) {
      const key = compactKey(alias)
      if (!key) continue
      owners.set(key, (owners.get(key) ?? new Set<string>()).add(type))
    }
  }
  const aliases = new Map<string, string>()
  for (const [key, types] of owners) if (types.size === 1) aliases.set(key, [...types][0])
  return aliases
})()

const EXACT_TYPES = new Set<string>(RI_TYPES)

export function canonicalType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (EXACT_TYPES.has(trimmed)) return trimmed
  return TYPE_ALIASES.get(compactKey(trimmed))
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function asText(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined || value === null) return ""
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function pick(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (record[key] !== undefined) return record[key]
  return undefined
}

function coerceConfig(value: unknown): RiConfigEntry[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const key = asText(pick(entry, ["key", "chave", "name"])).trim()
      return key ? [{ key, value: asText(pick(entry, ["value", "valor"])) }] : []
    })
  }
  if (isRecord(value)) return Object.entries(value).map(([key, entry]) => ({ key, value: asText(entry) }))
  return []
}

function coerceNode(value: unknown): RiNode | null {
  if (!isRecord(value)) return null
  const rawType = asText(pick(value, ["type", "tipo"]))
  return {
    id: asText(pick(value, ["id"])),
    type: canonicalType(rawType) ?? rawType,
    config: coerceConfig(pick(value, ["config", "configuracao", "data", "fields"])),
  }
}

function coerceEdge(value: unknown): RiEdge | null {
  if (!isRecord(value)) return null
  return {
    from: asText(pick(value, ["from", "source", "de"])),
    output: asText(pick(value, ["output", "sourceHandle", "saida", "label"])),
    to: asText(pick(value, ["to", "target", "para"])),
  }
}

export function coerceRi(value: unknown): RiFlow | null {
  if (!isRecord(value)) return null
  const nodes = Array.isArray(value.nodes) ? value.nodes : []
  const edges = Array.isArray(value.edges) ? value.edges : []
  return {
    name: asText(value.name),
    description: asText(value.description),
    nodes: nodes.flatMap((node) => coerceNode(node) ?? []),
    edges: edges.flatMap((edge) => coerceEdge(edge) ?? []),
  }
}

export function repairRiText(text: string): string | null {
  const parsed = parseJsonText(sliceObject(text))
  if (!parsed.ok) return null
  const ri = coerceRi(parsed.value)
  return ri ? JSON.stringify(ri) : null
}

export function countRi(value: unknown): { nodes: number; edges: number } {
  if (!isRecord(value)) return { nodes: 0, edges: 0 }
  return {
    nodes: Array.isArray(value.nodes) ? value.nodes.length : 0,
    edges: Array.isArray(value.edges) ? value.edges.length : 0,
  }
}
