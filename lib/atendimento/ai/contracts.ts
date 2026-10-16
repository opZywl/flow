import type { AtendimentoFlow } from "../types"
import type { ProviderId } from "./providers"

export type GenerationSize = "auto" | "small" | "medium" | "large" | "custom"

export const GENERATION_SIZES: readonly GenerationSize[] = ["auto", "small", "medium", "large", "custom"]

export const SIZE_RANGES: Readonly<Record<"small" | "medium" | "large", readonly [number, number]>> = {
  small: [3, 6],
  medium: [7, 14],
  large: [15, 30],
}

export const COUNT_LIMITS = { min: 2, max: 60 } as const

export const AUTO_COMPONENT_LIMIT = 150

export const LIMITS = {
  prompt: 8000,
  name: 80,
  description: 300,
  imageBytes: 5 * 1024 * 1024,
  bodyBytes: 8 * 1024 * 1024,
  apiKey: 512,
  model: 128,
} as const

export const RI_LIMITS = {
  nodes: 200,
  edges: 400,
  configEntries: 60,
  value: 20000,
  id: 60,
  menuOptions: 10,
  conditions: 20,
} as const

export const MAX_ROUNDS = 3

export type GenerationMode = "create" | "edit"

export const GENERATION_MODES: readonly GenerationMode[] = ["create", "edit"]

export const DEFAULT_MODE: GenerationMode = "create"

export const DEFAULT_FILL = true

export type Effort = "low" | "medium" | "high" | "max"

export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "max"]

export const DEFAULT_EFFORT: Effort = "medium"

export interface GenerateRequest {
  provider: ProviderId
  model: string
  apiKey: string
  prompt: string
  image?: string | null
  size: GenerationSize
  count?: number
  name?: string
  effort?: Effort
  stream?: boolean
  mode?: GenerationMode
  base?: unknown
  reserved?: string[]
  fill?: boolean
}

export type IssueScope = "ia" | "plataforma" | "ajuste"

export interface GenerationIssue {
  severity: "error" | "warning"
  scope: IssueScope
  message: string
  nodeId?: string
  riId?: string
  type?: string
}

export interface GenerationChanges {
  added: number
  changed: number
  removed: number
}

export interface GenerationUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface GenerateSuccess {
  success: true
  workflow: AtendimentoFlow
  issues: GenerationIssue[]
  rounds: number
  usage?: GenerationUsage
  transcript: string
  model: { provider: ProviderId; id: string }
  partial?: boolean
  mode?: GenerationMode
  changes?: GenerationChanges
}

export type FailureCode =
  | "invalid_request"
  | "unsupported_media"
  | "payload_too_large"
  | "invalid_key"
  | "forbidden"
  | "billing"
  | "model_not_found"
  | "rate_limit"
  | "provider_error"
  | "provider_unavailable"
  | "network"
  | "timeout"
  | "invalid_output"
  | "output_too_long"
  | "content_filter"
  | "aborted"
  | "unknown"

export type RequestField = "provider" | "model" | "apiKey" | "prompt" | "image" | "size" | "count" | "name" | "effort" | "mode" | "base" | "fill"

export interface GenerateFailure {
  success: false
  error: string
  details?: string
  code: FailureCode
  field?: RequestField
}

export type GenerateResponse = GenerateSuccess | GenerateFailure

export type GenerationStage = "preparando" | "gerando" | "montando" | "validando" | "corrigindo"

export interface GenerationProgress {
  stage: GenerationStage
  round: number
  maxRounds: number
  nodes?: number
  edges?: number
  pending?: number
  resumed?: boolean
}

export type GenerateEvent =
  | { type: "progress"; progress: GenerationProgress }
  | { type: "result"; result: GenerateResponse }

export interface ModelsRequest {
  provider: ProviderId
  apiKey: string
}

export interface ModelInfo {
  id: string
  name: string
  vision?: boolean
}

export interface ModelsSuccess {
  models: ModelInfo[]
}

export interface ModelsFailure {
  error: string
  details?: string
  code: FailureCode
  field?: "provider" | "apiKey"
}

export type ModelsResponse = ModelsSuccess | ModelsFailure
