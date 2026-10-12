import { getComponentLabel } from "../catalog"
import { validateFlow } from "../format"
import type { AtendimentoFlow } from "../types"
import { assembleFlow, finalizeFlow, type AssembleOptions, type AssembledFlow } from "./assemble"
import type { GenerationIssue, IssueScope } from "./contracts"
import type { RiFlow } from "./ri"

export type Score = readonly [number, number, number]

export interface RoundEvaluation {
  ri: RiFlow
  assembled: AssembledFlow
  issues: GenerationIssue[]
  pending: string[]
  score: Score
}

export interface GenerationOutcome {
  workflow: AtendimentoFlow
  issues: GenerationIssue[]
}

export const PLATFORM_PATTERNS: readonly RegExp[] = [
  /^Informe o ID (do|da) /,
  /^Informe o nome (do|da) (departamento|tag|fluxo de destino|template|agente|agente de IA|lista|tabulação)\./,
  /^Informe a URL/,
  /^Informe a planilha\./,
  /^API não validada/,
]

const GROUP_ORDER = (issue: GenerationIssue) => (issue.severity === "error" ? 0 : issue.scope === "ia" ? 1 : issue.scope === "ajuste" ? 2 : 3)

export function platformScope(message: string): IssueScope {
  return PLATFORM_PATTERNS.some((pattern) => pattern.test(message)) ? "plataforma" : "ia"
}

export function reviewFlow(assembled: AssembledFlow): GenerationIssue[] {
  const types = new Map(assembled.flow.nodes.map((node) => [node.id, node.data.type]))
  const issues: GenerationIssue[] = []
  const seen = new Set<string>()
  const add = (issue: GenerationIssue) => {
    const key = JSON.stringify([issue.severity, issue.nodeId ?? null, issue.riId ?? null, issue.message])
    if (seen.has(key)) return
    seen.add(key)
    issues.push(issue)
  }
  for (const note of assembled.notes) {
    if (note.level === "hint") continue
    const riId = note.riId ?? (note.nodeId ? assembled.riIds.get(note.nodeId) : undefined)
    const type = note.type ?? (note.nodeId ? types.get(note.nodeId) : undefined)
    add({
      severity: note.level,
      scope: note.scope,
      message: note.message,
      ...(note.nodeId ? { nodeId: note.nodeId } : {}),
      ...(riId ? { riId } : {}),
      ...(type ? { type } : {}),
    })
  }
  for (const issue of validateFlow(assembled.flow)) {
    const riId = issue.nodeId ? assembled.riIds.get(issue.nodeId) : undefined
    const type = issue.nodeId ? types.get(issue.nodeId) : undefined
    add({
      severity: issue.severity,
      scope: issue.severity === "error" ? "ia" : platformScope(issue.message),
      message: issue.message,
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
      ...(riId ? { riId } : {}),
      ...(type ? { type } : {}),
    })
  }
  return issues.map((issue, index) => ({ issue, index })).sort((a, b) => GROUP_ORDER(a.issue) - GROUP_ORDER(b.issue) || a.index - b.index).map(({ issue }) => issue)
}

export function describeIssue(issue: Pick<GenerationIssue, "message" | "riId" | "type">): string {
  const label = issue.type ? `${getComponentLabel(issue.type)}: ` : ""
  return `[${issue.riId ?? "fluxo"}] ${label}${issue.message}`
}

export function correctionItems(assembled: AssembledFlow, issues: readonly GenerationIssue[]): string[] {
  const items = issues.filter((issue) => issue.scope === "ia").map(describeIssue)
  for (const note of assembled.notes) if (note.level === "hint") items.push(describeIssue(note))
  return [...new Set(items)]
}

export function scoreOf(issues: readonly GenerationIssue[]): Score {
  let errors = 0
  let pending = 0
  let platform = 0
  for (const issue of issues) {
    if (issue.severity === "error") errors++
    else if (issue.scope === "ia") pending++
    else if (issue.scope === "plataforma") platform++
  }
  return [errors, pending, platform]
}

export function compareScores(first: Score, second: Score): number {
  for (let index = 0; index < first.length; index++) if (first[index] !== second[index]) return first[index] - second[index]
  return 0
}

export function evaluateRi(ri: RiFlow, options: AssembleOptions = {}): RoundEvaluation {
  const assembled = assembleFlow(ri, options)
  const issues = reviewFlow(assembled)
  return { ri, assembled, issues, pending: correctionItems(assembled, issues), score: scoreOf(issues) }
}

export function pickBetter(current: RoundEvaluation | null | undefined, candidate: RoundEvaluation): RoundEvaluation {
  return current && compareScores(current.score, candidate.score) < 0 ? current : candidate
}

export function needsCorrection(evaluation: RoundEvaluation): boolean {
  return evaluation.issues.some((issue) => issue.scope === "ia")
}

export function concludeGeneration(evaluation: RoundEvaluation): GenerationOutcome {
  const finished = finalizeFlow(evaluation.assembled)
  return { workflow: finished.flow, issues: reviewFlow(finished) }
}
