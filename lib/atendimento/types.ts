import type { Viewport, XYPosition } from "reactflow"

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }

export interface AtendimentoData {
  type: string
  data: JsonObject
  html: string
  [key: string]: unknown
}

export interface Measured {
  width: number
  height: number
}

export interface AtendimentoNode {
  id: string
  type: string
  position: XYPosition
  data: AtendimentoData
  measured?: Measured
  selected?: boolean
  dragging?: boolean
  deletable?: boolean
  [key: string]: unknown
}

export interface AtendimentoEdge {
  type: string
  source: string
  sourceHandle: string
  target: string
  id: string
  targetHandle?: string | null
  [key: string]: unknown
}

export interface AtendimentoFlow {
  name: string
  description: string
  service_type: string
  created_at: string
  nodes: AtendimentoNode[]
  edges: AtendimentoEdge[]
  viewport: Viewport
  [key: string]: unknown
}

export interface FieldOption {
  value: string
  label: string
}

export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "url" | "json" | "timeRules"

export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  options?: FieldOption[]
  placeholder?: string
  hint?: string
  suggestions?: string[]
  mirror?: string
}

export interface ComponentDefinition {
  id: string
  label: string
  category: string
  nativeType?: string
  defaults?: () => JsonObject
  outputs?: number
  outputLabels?: string[]
  measured?: Measured
  fields?: FieldSpec[]
  summary?: string[]
}

export interface FlowIssue {
  severity: "error" | "warning"
  message: string
  nodeId?: string
}
