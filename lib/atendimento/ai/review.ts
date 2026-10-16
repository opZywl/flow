import { MENU_TYPE, NOTE_TYPE, START_ID, getComponentLabel } from "../catalog"
import { WAIT_QUESTION_MESSAGE, optionIndices, validateFlow } from "../format"
import type { AtendimentoFlow, AtendimentoNode } from "../types"
import { assembleFlow, finalizeFlow, type AssembleOptions, type AssembledFlow, type AssemblyNote } from "./assemble"
import type { GenerationIssue, IssueScope } from "./contracts"
import type { RiFlow } from "./ri"
import { foldText, listQuoted, quote } from "./text"
import { listSizes, trimList, type ListSize } from "./values"

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
  /^Informe a URL/,
  /^Informe a planilha\./,
  /^Selecione o agente de IA\./,
  /^API não validada/,
]

export const NAME_PATTERN = /^Informe o nome (do|da) (departamento|tag|fluxo de destino|template|agente|agente de IA|lista|tabulação)\./

const GROUP_ORDER = (issue: GenerationIssue) => (issue.severity === "error" ? 0 : issue.scope === "ia" ? 1 : issue.scope === "ajuste" ? 2 : 3)

export function platformScope(message: string, fill = true): IssueScope {
  return PLATFORM_PATTERNS.some((pattern) => pattern.test(message)) || (!fill && NAME_PATTERN.test(message)) ? "plataforma" : "ia"
}

export function reviewFlow(assembled: AssembledFlow): GenerationIssue[] {
  const fill = assembled.fill !== false
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
      scope: platformScope(issue.message, fill),
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

function waitGuidance(assembled: AssembledFlow, issue: GenerationIssue): string {
  if (issue.message !== WAIT_QUESTION_MESSAGE || !issue.nodeId) return ""
  const types = new Map(assembled.flow.nodes.map((node) => [node.id, node.data.type]))
  const sources = assembled.flow.edges.filter((edge) => edge.target === issue.nodeId && types.get(edge.source) !== "envio_pergunta").map((edge) => assembled.riIds.get(edge.source) ?? edge.source)
  const wait = issue.riId ?? issue.nodeId
  const link = sources.length ? ` Ligue ${listQuoted([...new Set(sources)])} ao novo Enviar Mensagem e ligue esse Enviar Mensagem a ${quote(wait)}.` : ""
  return ` A pergunta vai num Enviar Mensagem (envio_pergunta) ligado direto à entrada do Aguardando Mensagem, que guarda a resposta.${link}`
}

export function correctionItems(assembled: AssembledFlow, issues: readonly GenerationIssue[]): string[] {
  const items = issues.filter((issue) => issue.scope === "ia").map((issue) => `${describeIssue(issue)}${waitGuidance(assembled, issue)}`)
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

const finals = new WeakMap<RoundEvaluation, { errors: number; reached: number }>()

function finalOf(evaluation: RoundEvaluation): { errors: number; reached: number } {
  const known = finals.get(evaluation)
  if (known) return known
  const { flow } = finalizeFlow(evaluation.assembled)
  const reached = new Set([START_ID])
  for (const id of reached) for (const edge of flow.edges) if (edge.source === id) reached.add(edge.target)
  const result = { errors: validateFlow(flow).filter((issue) => issue.severity === "error").length, reached: reached.size - 1 }
  finals.set(evaluation, result)
  return result
}

export function pickBetter(current: RoundEvaluation | null | undefined, candidate: RoundEvaluation): RoundEvaluation {
  if (!current) return candidate
  const before = finalOf(current)
  const after = finalOf(candidate)
  if (after.reached * 2 < before.reached) return current
  if (before.reached * 2 < after.reached) return candidate
  if (before.errors !== after.errors) return before.errors < after.errors ? current : candidate
  return compareScores(current.score, candidate.score) < 0 ? current : candidate
}

export function needsCorrection(evaluation: RoundEvaluation): boolean {
  return evaluation.issues.some((issue) => issue.scope === "ia")
}

export function concludeGeneration(evaluation: RoundEvaluation): GenerationOutcome {
  const finished = finalizeFlow(evaluation.assembled)
  return { workflow: finished.flow, issues: reviewFlow(finished) }
}

interface MenuInfo {
  id: string
  key: string
  titles: RegExp[]
  count: number
  max: number
  changed: boolean
}

interface Mention {
  id: string
  start: number
  end: number
  cited: boolean
}

interface CountPhrase {
  count: number
  start: number
  end: number
}

const COUNT_WORDS: Readonly<Record<string, number>> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
}
const NUMBER_WORDS = `\\d{1,3}|${Object.keys(COUNT_WORDS).join("|")}`
const COUNT_NUMBER = `(${NUMBER_WORDS})`
const COUNT_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(?:fica(?:m|r|ra|rao)? com|passa(?:m|r|ra|rao)? a ter|termina(?:m|r|ra|rao)? com|total de|exatamente)\\s+(?:(?:as|os)\\s+)?(?:exatamente\\s+)?${COUNT_NUMBER}\\s+opc(?:ao|oes)\\b(?!\\s+atua)`, "g"),
  new RegExp(`\\b${COUNT_NUMBER}\\s+opc(?:ao|oes)\\s+(?:no total|ao todo)\\b`, "g"),
  new RegExp(`\\b(?:troque|troca|trocar|substitua|substituir)\\s+(?:todas\\s+)?as\\s+(?:(?:${NUMBER_WORDS})\\s+)?opcoes(?:\\s+atuais)?(?:\\s+do\\s+menu\\b[^.;]*?)?\\s+(?:por\\s+(?:estas\\s+|essas\\s+|as\\s+)?${COUNT_NUMBER}(?:\\s+novas)?(?:\\s+opc(?:ao|oes)\\b|\\s*:)|pelas\\s+${COUNT_NUMBER}\\s+(?:novas|opc(?:ao|oes))\\b)`, "g"),
]
const TITLE_KEY_MIN = 6
const GENERIC_WORDS = new Set(["a", "abaixo", "as", "da", "das", "de", "digite", "do", "dos", "escolha", "escolher", "menu", "numero", "o", "opcao", "opcoes", "os", "selecione", "seguintes", "uma", "um"])
const OUTPUT_INDEX = /^output-(\d+)$/

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const optionsText = (count: number) => `${count} ${count === 1 ? "opção" : "opções"}`

function titleKeys(title: unknown): RegExp[] {
  if (typeof title !== "string") return []
  const keys = new Map<string, RegExp>()
  for (const part of [title, ...title.split(/[\n.!?:]+/)]) {
    const words = foldText(part).split(/[^a-z0-9]+/).filter(Boolean)
    const key = words.join(" ")
    if (key.length < TITLE_KEY_MIN || keys.has(key) || words.every((word) => GENERIC_WORDS.has(word))) continue
    keys.set(key, new RegExp(`(^|[^a-z0-9])(${words.map(escapeRegex).join("[^a-z0-9]+")})(?![a-z0-9])`, "g"))
  }
  return [...keys.values()]
}

function optionTexts(node: AtendimentoNode | undefined): string {
  if (!node || node.data.type !== MENU_TYPE) return ""
  return JSON.stringify(optionIndices(node.data.data).map((index) => node.data.data[`text-${index}`] ?? ""))
}

function menusOf(original: AtendimentoFlow, flow: AtendimentoFlow): MenuInfo[] {
  const previous = new Map(original.nodes.map((node) => [node.id, node]))
  return flow.nodes.flatMap((node) => {
    if (node.data.type !== MENU_TYPE) return []
    const size = listSizes(MENU_TYPE, node.data.data).find((entry) => entry.kind === "menuOptions")
    if (!size) return []
    const before = previous.get(node.id)
    return [{ id: node.id, key: foldText(node.id), titles: titleKeys(node.data.data.title), count: size.count, max: size.max, changed: !before || optionTexts(before) !== optionTexts(node) }]
  })
}

function sentencesOf(text: string): string[] {
  return text.split(/\n+|;\s*|\.(?=\s|$)/).map(foldText).filter(Boolean)
}

function countPhrases(sentence: string): CountPhrase[] {
  const found: CountPhrase[] = []
  for (const pattern of COUNT_PATTERNS) {
    for (const match of sentence.matchAll(pattern)) {
      const word = match.slice(1).find((value) => value !== undefined) ?? ""
      const count = /^\d+$/.test(word) ? Number(word) : COUNT_WORDS[word]
      if (count !== undefined) found.push({ count, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length })
    }
  }
  found.sort((a, b) => a.start - b.start)
  return found.filter((phrase, index) => !found.slice(0, index).some((other) => other.start < phrase.end && phrase.start < other.end))
}

function mentionsOf(sentence: string, menus: readonly MenuInfo[]): Mention[] {
  const mentions: Mention[] = []
  for (const menu of menus) {
    for (const title of menu.titles) {
      for (const match of sentence.matchAll(title)) {
        const start = (match.index ?? 0) + match[1].length
        mentions.push({ id: menu.id, start, end: start + match[2].length, cited: false })
      }
    }
    const cite = new RegExp(`(?:\\bids?(?![a-z])\\s*[:#]?\\s*(?:[^\\s,;:.()]+\\s*(?:,|\\be\\b|\\bou\\b)\\s*)*|#\\s?)${escapeRegex(menu.key)}(?![a-z0-9_-])`, "g")
    for (const match of sentence.matchAll(cite)) mentions.push({ id: menu.id, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, cited: true })
  }
  return mentions.filter((mention) => !mentions.some((other) => other.id !== mention.id && !other.cited && !mention.cited && other.start <= mention.start && other.end >= mention.end && other.end - other.start > mention.end - mention.start))
}

function targetsOf(mentions: readonly Mention[], phrase: CountPhrase, lower: number, upper: number): string[] {
  const before = mentions.filter((mention) => mention.start >= lower && mention.start < phrase.end)
  const after = mentions.filter((mention) => mention.start >= phrase.end && mention.start < upper)
  const side = before.length ? before : after
  if (!side.length) return []
  const edge = before.length ? Math.max(...side.map((mention) => mention.start)) : Math.min(...side.map((mention) => mention.start))
  const chosen = side.filter((mention) => mention.start === edge)
  const ids = [...new Set(chosen.map((mention) => mention.id))]
  return ids.length === 1 || chosen.every((mention) => mention.cited) ? ids : []
}

function countNotes(original: AtendimentoFlow, flow: AtendimentoFlow, plan: string, name: (id: string) => string): AssemblyNote[] {
  const stated = sentencesOf(plan).map((sentence) => ({ sentence, found: countPhrases(sentence) })).filter(({ found }) => found.length)
  if (!stated.length) return []
  const menus = menusOf(original, flow)
  if (!menus.length) return []
  const wanted = new Map<string, Set<number>>()
  const loose: number[] = []
  let phrases = 0
  for (const { sentence, found } of stated) {
    const mentions = mentionsOf(sentence, menus)
    for (const [index, phrase] of found.entries()) {
      phrases++
      const targets = targetsOf(mentions, phrase, found[index - 1]?.end ?? 0, found[index + 1]?.start ?? Number.POSITIVE_INFINITY)
      if (!targets.length) loose.push(phrase.count)
      for (const id of targets) wanted.set(id, (wanted.get(id) ?? new Set<number>()).add(phrase.count))
    }
  }
  const changed = menus.filter((menu) => menu.changed)
  if (phrases === 1 && loose.length === 1 && changed.length === 1) wanted.set(changed[0].id, new Set(loose))
  const notes: AssemblyNote[] = []
  for (const menu of menus) {
    const counts = wanted.get(menu.id)
    if (!counts || counts.size !== 1) continue
    const [count] = counts
    if (count < 1 || count > menu.max || count === menu.count) continue
    const message = `O pedido pede ${optionsText(count)} neste menu, e ele ficou com ${menu.count}. Deixe o menu com exatamente ${optionsText(count)}, as do pedido, na ordem dele.`
    notes.push({ level: "error", scope: "ia", message, riId: name(menu.id), nodeId: menu.id, type: MENU_TYPE })
  }
  return notes
}

function priorCount(node: AtendimentoNode | undefined, type: string, key: string): number {
  if (!node || node.data.type !== type) return 0
  return listSizes(type, node.data.data).find((size) => size.key === key)?.count ?? 0
}

function overLists(original: AtendimentoFlow, flow: AtendimentoFlow): Array<{ node: AtendimentoNode; size: ListSize; keep: number }> {
  const previous = new Map(original.nodes.map((node) => [node.id, node]))
  const found: Array<{ node: AtendimentoNode; size: ListSize; keep: number }> = []
  for (const node of flow.nodes) {
    for (const size of listSizes(node.data.type, node.data.data)) {
      const keep = Math.max(size.max, priorCount(previous.get(node.id), node.data.type, size.key))
      if (size.count > keep) found.push({ node, size, keep })
    }
  }
  return found
}

function overMessage(size: ListSize): string {
  return size.kind === "menuOptions"
    ? `O menu ficou com ${size.count} opções, e o limite é de ${size.max}. Deixe até ${size.max} opções nele: divida em dois menus, com uma opção que leva ao segundo, ou reduza as opções, como o pedido indicar.`
    : `A Múltipla Condição ficou com ${size.count} condições, e o limite é de ${size.max}. Deixe até ${size.max} condições nela.`
}

function cutMessage(size: ListSize, cut: readonly string[]): string {
  const one = cut.length === 1
  if (size.kind === "menuOptions") {
    return `O menu aceita até ${size.max} opções, e a edição trouxe ${size.count}. ${one ? "A opção" : "As opções"} ${listQuoted(cut)} ${one ? "ficou" : "ficaram"} de fora, com os passos que só ${one ? "ela alcançava" : "elas alcançavam"}. Para manter todas, peça para dividir em dois menus, com uma opção que leva ao segundo.`
  }
  return `A Múltipla Condição aceita até ${size.max} condições, e a edição trouxe ${size.count}. ${one ? "A condição" : "As condições"} ${listQuoted(cut)} ${one ? "ficou" : "ficaram"} de fora, com os passos que só ${one ? "ela alcançava" : "elas alcançavam"}.`
}

export function planNotes(original: AtendimentoFlow, flow: AtendimentoFlow, name: (id: string) => string, plan = ""): AssemblyNote[] {
  const over: AssemblyNote[] = overLists(original, flow).map(({ node, size }) => ({ level: "error", scope: "ia", message: overMessage(size), riId: name(node.id), nodeId: node.id, type: node.data.type }))
  return [...over, ...countNotes(original, flow, plan, name)]
}

function reachOf(flow: AtendimentoFlow): Set<string> {
  const reached = new Set([START_ID])
  for (const id of reached) for (const edge of flow.edges) if (edge.source === id) reached.add(edge.target)
  return reached
}

export function capLists(original: AtendimentoFlow, flow: AtendimentoFlow, name: (id: string) => string): AssemblyNote[] {
  const over = overLists(original, flow)
  if (!over.length) return []
  const reached = reachOf(flow)
  const notes: AssemblyNote[] = []
  for (const { node, size, keep } of over) {
    const cut = trimList(node.data.data, size.kind, keep)
    flow.edges = flow.edges.filter((edge) => edge.source !== node.id || Number(OUTPUT_INDEX.exec(edge.sourceHandle)?.[1] ?? -1) < keep)
    notes.push({ level: "error", scope: "ajuste", message: cutMessage(size, cut), riId: name(node.id), nodeId: node.id, type: node.data.type })
  }
  const after = reachOf(flow)
  const dropped = new Set(flow.nodes.filter((node) => reached.has(node.id) && !after.has(node.id) && node.data.type !== NOTE_TYPE).map((node) => node.id))
  if (dropped.size) {
    flow.nodes = flow.nodes.filter((node) => !dropped.has(node.id))
    flow.edges = flow.edges.filter((edge) => !dropped.has(edge.source) && !dropped.has(edge.target))
  }
  return notes
}
