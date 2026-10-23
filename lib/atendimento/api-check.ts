import { getDefinition } from "./catalog"
import type { JsonObject, JsonValue } from "./types"

export type TestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type TestErrorCode =
  | "invalid_request"
  | "unsupported_media"
  | "payload_too_large"
  | "invalid_url"
  | "invalid_method"
  | "invalid_headers"
  | "forbidden_header"
  | "body_too_large"
  | "forbidden_origin"
  | "rate_limited"
  | "blocked_address"
  | "blocked_port"
  | "dns"
  | "refused"
  | "unreachable"
  | "timeout"
  | "certificate"
  | "tls"
  | "network"
  | "invalid_response"
  | "too_many_redirects"
  | "invalid_redirect"
  | "offline"
  | "unknown"

export interface TestError {
  code: TestErrorCode
  message: string
}

export interface TestApiRequest {
  url: string
  method: TestMethod
  headers: Array<[string, string]>
  body?: string
}

export interface TestApiResponse {
  ok: boolean
  status?: number
  statusText?: string
  timeMs?: number
  contentType?: string
  json?: JsonValue
  text?: string
  truncated?: boolean
  redirects?: number
  error?: TestError
}

export type ParsedTestRequest = { ok: true; request: TestApiRequest } | { ok: false; error: TestError }

export interface ApiCall {
  key: string
  label: string
  url: string
  method: string
  choices?: readonly TestMethod[]
  headers: Array<[string, string]>
  body: string
  optional: boolean
  problem?: string
}

export interface ApiPlan {
  type: string
  calls: ApiCall[]
  stores: boolean
  testValuesKey?: string
}

export interface CallOutcome {
  valid: boolean
  message: string
  status?: number
  timeMs?: number
  fields: string[]
  moreFields: number
  preview: string
}

interface CallSpec {
  key: string
  method?: TestMethod
  stored?: "full" | "method"
  optional?: boolean
}

interface TypeSpec {
  calls: CallSpec[]
  active?: (data: JsonObject) => boolean
}

export const TEST_API_PATH = "/api/test-api"
export const TEST_METHODS: readonly TestMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]
export const CHOICE_METHODS: readonly TestMethod[] = ["GET", "POST"]
export const TEST_LIMITS = {
  url: 2048,
  headers: 30,
  headerName: 100,
  headerValue: 8192,
  headerBytes: 32 * 1024,
  body: 100 * 1024,
  response: 256 * 1024,
  redirects: 3,
  timeoutMs: 10_000,
} as const

const STORED_CALL: CallSpec = { key: "url_api", stored: "full" }
const API_CALLS: Record<string, TypeSpec> = {
  consulta_api: { calls: [STORED_CALL] },
  solicitar_dados: { calls: [STORED_CALL] },
  protocolo: { calls: [{ key: "url_api", method: "GET" }], active: (data) => data.opt === "URL" },
  External_Message_Http: { calls: [{ key: "url_api", stored: "method" }] },
  Send_DataStore: { calls: [{ key: "url_api", stored: "method" }] },
  api_options_menu: { calls: [{ key: "apiUrl", method: "GET" }, { key: "postUrl", method: "POST", optional: true }] },
  envio_boletos: { calls: [{ key: "url_list", method: "GET" }, { key: "url_send", method: "POST" }] },
}

export const API_CHECK_TYPES: ReadonlySet<string> = new Set(Object.keys(API_CALLS))

const VARIABLE = /@@@([\w-]+(?::[\w-]+)*)|\{\{\s*([^{}\s]+)\s*\}\}/g
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/
const FORBIDDEN_HEADERS: ReadonlySet<string> = new Set(["host", "content-length", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "expect", "proxy-authorization", "proxy-authenticate", "proxy-connection", "http2-settings"])
const BAD_PORTS: ReadonlySet<number> = new Set([0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])
const V4_BLOCKS = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"].map(v4Block)
const V6_GLOBAL = v6Block("2000::/3")
const V6_BLOCKS = ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].map(v6Block)
const METHOD_PROBLEM = "Corrija o método HTTP no componente: use GET, POST, PUT, PATCH ou DELETE."
const TOO_LARGE = `Resposta grande demais. A API devolveu mais de ${TEST_LIMITS.response / 1024} KB.`
const PREVIEW_LIMIT = 300
const FIELD_LIMIT = 12
const FIELD_DEPTH = 5
const ROUND = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const INITIAL_HASH = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

export const TEST_ERROR_MESSAGES: Readonly<Record<TestErrorCode, string>> = {
  invalid_request: "Não foi possível montar o teste. Confira a URL, o método e os cabeçalhos.",
  unsupported_media: "O pedido de teste precisa ser enviado em JSON.",
  payload_too_large: "O pedido de teste é grande demais.",
  invalid_url: "URL inválida. Use um endereço completo, iniciado por http:// ou https://.",
  invalid_method: "Método HTTP inválido. Use GET, POST, PUT, PATCH ou DELETE.",
  invalid_headers: `Cabeçalhos inválidos. Use pares de nome e valor em texto, até ${TEST_LIMITS.headers} cabeçalhos.`,
  forbidden_header: "Cabeçalho não permitido no teste.",
  body_too_large: `Corpo grande demais. O teste aceita até ${TEST_LIMITS.body / 1024} KB.`,
  forbidden_origin: "Teste recusado. Abra o editor neste site para testar a API.",
  rate_limited: "Muitos testes em pouco tempo. Aguarde um minuto e teste de novo.",
  blocked_address: "Endereço interno bloqueado. O teste só acessa APIs publicadas na internet.",
  blocked_port: "Porta bloqueada. O teste não acessa essa porta por segurança.",
  dns: "Domínio não encontrado. Confira o endereço da API.",
  refused: "Conexão recusada. O servidor da API não aceitou a conexão.",
  unreachable: "Servidor da API inalcançável. Confira o endereço e a porta.",
  timeout: `Tempo esgotado. A API não respondeu em ${TEST_LIMITS.timeoutMs / 1000} segundos.`,
  certificate: "Erro de certificado. Não foi possível confirmar a conexão segura com a API.",
  tls: "Falha na conexão segura. Confira se a API usa https nesse endereço.",
  network: "A conexão com a API caiu antes da resposta.",
  invalid_response: "A API devolveu uma resposta HTTP inválida.",
  too_many_redirects: `Redirecionamentos demais. A API redirecionou mais de ${TEST_LIMITS.redirects} vezes.`,
  invalid_redirect: "A API redirecionou para um endereço inválido.",
  offline: "Não foi possível falar com o servidor do editor. Confira a conexão e teste de novo.",
  unknown: "Não foi possível testar a API. Teste de novo.",
}

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const textOf = (value: JsonValue | undefined) => typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : ""
const scalar = (value: unknown): value is string | number | boolean => typeof value === "string" || typeof value === "number" || typeof value === "boolean"
const unique = (items: string[]) => [...new Set(items)]
const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits))
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
const byteLength = (text: string) => new TextEncoder().encode(text).length

export const isTestMethod = (value: unknown): value is TestMethod => typeof value === "string" && (TEST_METHODS as readonly string[]).includes(value)

export function testError(code: TestErrorCode, message = TEST_ERROR_MESSAGES[code]): TestError {
  return { code, message }
}

function shapeOf(type: string): JsonObject {
  const definition = getDefinition(type)
  return definition?.configured?.() ?? definition?.defaults?.() ?? {}
}

function labelOf(type: string, key: string): string {
  const definition = getDefinition(type)
  return definition?.fields?.find((field) => field.key === key)?.label ?? definition?.technicalLabels?.[key] ?? key
}

function storedMethod(data: JsonObject): { value: string; problem?: string } {
  if (!has(data, "method")) return { value: "POST" }
  const value = data.method
  return isTestMethod(value) ? { value } : { value: textOf(value), problem: METHOD_PROBLEM }
}

export function headerPairs(value: JsonValue | undefined): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  const push = (name: unknown, entry: unknown) => {
    const key = typeof name === "string" ? name.trim() : ""
    if (key && scalar(entry)) pairs.push([key, String(entry)])
  }
  const read = (item: JsonValue) => {
    if (typeof item === "string") {
      const colon = item.indexOf(":")
      if (colon > 0) push(item.slice(0, colon), item.slice(colon + 1).trim())
      return
    }
    if (Array.isArray(item)) {
      if (item.length === 2) push(item[0], item[1])
      return
    }
    if (!isRecord(item) || item.disabled === true || item.enabled === false) return
    const name = ["key", "name", "header"].map((key) => item[key]).find((entry) => typeof entry === "string")
    if (name !== undefined && has(item, "value")) {
      push(name, item.value)
      return
    }
    for (const [key, entry] of Object.entries(item)) push(key, entry)
  }
  if (Array.isArray(value)) value.forEach(read)
  else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) push(key, entry)
  return pairs
}

function callOf(type: string, spec: CallSpec, data: JsonObject): ApiCall {
  const base = { key: spec.key, label: labelOf(type, spec.key), url: textOf(data[spec.key]).trim(), optional: spec.optional === true }
  if (!spec.stored) return { ...base, method: spec.method ?? "GET", choices: CHOICE_METHODS, headers: [], body: "" }
  const method = storedMethod(data)
  return {
    ...base,
    method: method.value,
    ...(method.problem ? { problem: method.problem } : {}),
    headers: spec.stored === "full" ? headerPairs(data.headers) : [],
    body: spec.stored === "full" ? textOf(data.body_value) : "",
  }
}

export function apiPlan(type: string, data: JsonObject): ApiPlan | undefined {
  const spec = has(API_CALLS, type) ? API_CALLS[type] : undefined
  if (!spec || (spec.active && !spec.active(data))) return undefined
  const shape = shapeOf(type)
  return {
    type,
    calls: spec.calls.map((call) => callOf(type, call, data)),
    stores: has(shape, "isApiValidated"),
    ...(has(shape, "api_test_values") ? { testValuesKey: "api_test_values" } : {}),
  }
}

export function variablesIn(text: string): string[] {
  return unique(Array.from(text.matchAll(VARIABLE), (match) => match[1] ?? match[2]))
}

export function missingUrls(plan: ApiPlan): ApiCall[] {
  return plan.calls.filter((call) => !call.optional && !call.url)
}

export function testedCalls(plan: ApiPlan): ApiCall[] {
  return plan.calls.filter((call) => call.url)
}

export function planTokens(plan: ApiPlan): Array<{ name: string; token: string }> {
  const tokens = new Map<string, string>()
  for (const call of testedCalls(plan)) {
    for (const text of [call.url, ...call.headers.flat(), call.body]) {
      for (const match of text.matchAll(VARIABLE)) {
        const name = match[1] ?? match[2]
        if (!tokens.has(name)) tokens.set(name, match[1] === undefined ? `{{${name}}}` : `@@@${name}`)
      }
    }
  }
  return Array.from(tokens, ([name, token]) => ({ name, token }))
}

export function planVariables(plan: ApiPlan): string[] {
  return planTokens(plan).map((entry) => entry.name)
}

function valueOf(values: Readonly<Record<string, string>>, name: string): string | undefined {
  return has(values, name) ? values[name] : undefined
}

export function fillVariables(text: string, values: Readonly<Record<string, string>>, encode: (value: string) => string = (value) => value): string {
  return text.replace(VARIABLE, (token: string, legacy: string | undefined, modern: string | undefined) => {
    const value = valueOf(values, legacy ?? modern ?? "")
    return value === undefined ? token : encode(value)
  })
}

export function fillBody(body: string, values: Readonly<Record<string, string>>): string {
  if (!/^\s*[[{]/.test(body)) return fillVariables(body, values)
  let quoted = false
  let escaped = false
  let last = 0
  let result = ""
  for (const match of body.matchAll(VARIABLE)) {
    const index = match.index ?? 0
    for (const char of body.slice(last, index)) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = quoted
      else if (char === "\"") quoted = !quoted
    }
    const value = valueOf(values, match[1] ?? match[2])
    result += body.slice(last, index) + (value === undefined ? match[0] : quoted ? JSON.stringify(value).slice(1, -1) : value)
    last = index + match[0].length
  }
  return result + body.slice(last)
}

export function testRequest(call: ApiCall, values: Readonly<Record<string, string>>, method: string = call.method): TestApiRequest {
  const verb = (isTestMethod(method) ? method : call.method) as TestMethod
  const body = verb === "GET" || !call.body ? "" : fillBody(call.body, values)
  return {
    url: fillVariables(call.url, values, encodeURIComponent),
    method: verb,
    headers: call.headers.map(([name, value]): [string, string] => [fillVariables(name, values), fillVariables(value, values)]),
    ...(body ? { body } : {}),
  }
}

export function checkTestUrl(text: string): { ok: true; url: URL } | { ok: false; error: TestError } {
  if (text.length > TEST_LIMITS.url) return { ok: false, error: testError("invalid_url", `URL inválida. O endereço passa de ${TEST_LIMITS.url} caracteres.`) }
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return { ok: false, error: testError("invalid_url") }
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return { ok: false, error: testError("invalid_url") }
  if (url.username || url.password) return { ok: false, error: testError("invalid_url", "URL inválida. Tire o usuário e a senha do endereço e use um cabeçalho de autenticação.") }
  if (url.href.length > TEST_LIMITS.url) return { ok: false, error: testError("invalid_url", `URL inválida. O endereço passa de ${TEST_LIMITS.url} caracteres.`) }
  return { ok: true, url }
}

function headerProblem(entry: unknown): TestError | undefined {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") return testError("invalid_headers")
  const [name, value] = entry as [string, string]
  if (!name || name.length > TEST_LIMITS.headerName || !HEADER_NAME.test(name)) return testError("invalid_headers", `Cabeçalho inválido: “${clip(name, 40)}”. Use só letras, números e hífen no nome.`)
  if (FORBIDDEN_HEADERS.has(name.toLowerCase())) return testError("forbidden_header", `Cabeçalho não permitido no teste: ${name}.`)
  if (value.length > TEST_LIMITS.headerValue || !HEADER_VALUE.test(value)) return testError("invalid_headers", `Valor inválido no cabeçalho ${name}. Use texto sem quebra de linha, até ${TEST_LIMITS.headerValue} caracteres.`)
  return undefined
}

export function parseTestRequest(input: unknown): ParsedTestRequest {
  if (!isRecord(input)) return { ok: false, error: testError("invalid_request") }
  if (typeof input.url !== "string" || !input.url.trim()) return { ok: false, error: testError("invalid_url") }
  const address = checkTestUrl(input.url)
  if (!address.ok) return address
  const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : ""
  if (!isTestMethod(method)) return { ok: false, error: testError("invalid_method") }
  const headers = input.headers ?? []
  if (!Array.isArray(headers) || headers.length > TEST_LIMITS.headers) return { ok: false, error: testError("invalid_headers") }
  for (const entry of headers) {
    const problem = headerProblem(entry)
    if (problem) return { ok: false, error: problem }
  }
  const pairs = headers as Array<[string, string]>
  if (pairs.reduce((total, [name, value]) => total + name.length + value.length, 0) > TEST_LIMITS.headerBytes) return { ok: false, error: testError("invalid_headers") }
  const body = input.body ?? ""
  if (typeof body !== "string") return { ok: false, error: testError("invalid_request") }
  if (byteLength(body) > TEST_LIMITS.body) return { ok: false, error: testError("body_too_large") }
  return { ok: true, request: { url: address.url.href, method, headers: pairs.map(([name, value]): [string, string] => [name, value]), ...(body && method !== "GET" ? { body } : {}) } }
}

function v4Number(text: string): number | undefined {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)?.slice(1).map(Number)
  if (!parts || parts.some((part) => part > 255)) return undefined
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function v6Words(input: string): number[] | undefined {
  let text = input.toLowerCase().replace(/%.*$/, "")
  let tail: number[] = []
  const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)
  if (dotted) {
    const value = v4Number(dotted[1])
    if (value === undefined) return undefined
    tail = [value >>> 16, value & 0xffff]
    text = text.slice(0, -dotted[1].length)
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1)
  }
  const halves = text.split("::")
  if (halves.length > 2) return undefined
  const parse = (part: string) => part === "" ? [] : part.split(":").map((word) => /^[0-9a-f]{1,4}$/.test(word) ? parseInt(word, 16) : NaN)
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  if ([...head, ...rest].some(Number.isNaN)) return undefined
  const count = head.length + rest.length + tail.length
  if (halves.length === 2 ? count > 7 : count !== 8) return undefined
  return [...head, ...new Array<number>(halves.length === 2 ? 8 - count : 0).fill(0), ...rest, ...tail]
}

function v4Block(cidr: string): [number, number] {
  const [address, size] = cidr.split("/")
  const mask = Number(size) === 0 ? 0 : (0xffffffff << (32 - Number(size))) >>> 0
  return [((v4Number(address) ?? 0) & mask) >>> 0, mask]
}

function v6Block(cidr: string): [number[], number] {
  const [address, size] = cidr.split("/")
  return [v6Words(address) ?? [], Number(size)]
}

function inV6(words: number[], [prefix, size]: [number[], number]): boolean {
  for (let index = 0, left = size; index < 8 && left > 0; index++, left -= 16) {
    const bits = Math.min(16, left)
    const mask = (0xffff << (16 - bits)) & 0xffff
    if ((words[index] & mask) !== ((prefix[index] ?? 0) & mask)) return false
  }
  return true
}

export function isIpAddress(text: string): boolean {
  const host = text.replace(/^\[|\]$/g, "")
  return v4Number(host) !== undefined || (host.includes(":") && v6Words(host) !== undefined)
}

export function blockedAddress(address: string): boolean {
  const text = address.trim().replace(/^\[|\]$/g, "")
  const v4 = v4Number(text)
  if (v4 !== undefined) return V4_BLOCKS.some(([base, mask]) => ((v4 & mask) >>> 0) === base)
  const v6 = text.includes(":") ? v6Words(text) : undefined
  if (!v6) return true
  return !inV6(v6, V6_GLOBAL) || V6_BLOCKS.some((block) => inV6(v6, block))
}

export const blockedPort = (port: number) => BAD_PORTS.has(port)

export const portOf = (url: URL) => url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80

export function targetProblem(url: URL, allow: (address: string, port: number) => boolean = () => false): TestError | undefined {
  const port = portOf(url)
  if (blockedPort(port)) return testError("blocked_port")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIpAddress(host) && blockedAddress(host) && !allow(host, port)) return testError("blocked_address")
  return undefined
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const words = new Uint32Array((((bytes.length + 8) >>> 6) + 1) * 16)
  bytes.forEach((byte, index) => { words[index >>> 2] |= byte << (24 - (index % 4) * 8) })
  words[bytes.length >>> 2] |= 0x80 << (24 - (bytes.length % 4) * 8)
  const bits = bytes.length * 8
  words[words.length - 2] = Math.floor(bits / 0x100000000)
  words[words.length - 1] = bits >>> 0
  const hash = Uint32Array.from(INITIAL_HASH)
  const schedule = new Uint32Array(64)
  for (let offset = 0; offset < words.length; offset += 16) {
    for (let round = 0; round < 64; round++) {
      if (round < 16) {
        schedule[round] = words[offset + round]
        continue
      }
      const early = schedule[round - 15]
      const late = schedule[round - 2]
      schedule[round] = schedule[round - 16] + (rotate(early, 7) ^ rotate(early, 18) ^ (early >>> 3)) + schedule[round - 7] + (rotate(late, 17) ^ rotate(late, 19) ^ (late >>> 10))
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let round = 0; round < 64; round++) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + ROUND[round] + schedule[round]) >>> 0
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g
      g = f
      f = e
      e = (d + first) >>> 0
      d = c
      c = b
      b = a
      a = (first + second) >>> 0
    }
    hash.set([a, b, c, d, e, f, g, h].map((word, index) => hash[index] + word))
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("")
}

export function validationSignature(data: JsonObject): string {
  return sha256Hex(canonicalJson({
    url_api: textOf(data.url_api),
    method: typeof data.method === "string" && data.method ? data.method : "POST",
    headers: data.headers ?? [],
    body_value: textOf(data.body_value),
  }))
}

function jsonObject(text: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value as JsonObject : undefined
  } catch {
    return undefined
  }
}

export function validationPatch(type: string, data: JsonObject, values: Readonly<Record<string, string>>): JsonObject {
  const shape = shapeOf(type)
  if (!has(shape, "isApiValidated")) return {}
  const patch: JsonObject = { isApiValidated: true }
  if (has(shape, "validated_signature")) patch.validated_signature = validationSignature(data)
  const parsed = has(shape, "parsed_body") ? jsonObject(textOf(data.body_value)) : undefined
  if (parsed) patch.parsed_body = parsed
  if (has(shape, "api_test_values")) patch.api_test_values = Object.fromEntries(Object.entries(values))
  return patch
}

export function clearedValidation(type: string): JsonObject {
  const shape = shapeOf(type)
  if (!has(shape, "isApiValidated")) return {}
  return { isApiValidated: false, ...(has(shape, "validated_signature") ? { validated_signature: "" } : {}) }
}

export function planKey(plan: ApiPlan): string {
  return sha256Hex(canonicalJson([plan.type, plan.calls.map((call) => [call.key, call.url, call.choices ? "" : call.method, call.headers, call.body])]))
}

export function initialValues(plan: ApiPlan, data: JsonObject): Record<string, string> {
  const saved = plan.testValuesKey ? data[plan.testValuesKey] : undefined
  return Object.fromEntries(planVariables(plan).map((name) => [name, isRecord(saved) && scalar(saved[name]) ? String(saved[name]) : ""]))
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`
}

function statusHint(status: number): string {
  if (status === 400 || status === 422) return "Confira o corpo e os valores de teste."
  if (status === 401 || status === 403) return "Confira os cabeçalhos de autenticação."
  if (status === 404 || status === 410) return "Confira a URL."
  if (status === 405) return "Confira o método HTTP."
  if (status === 408) return "A API demorou demais para responder."
  if (status === 413) return "O corpo enviado é grande demais para a API."
  if (status === 415) return "Confira o tipo do corpo no cabeçalho Content-Type."
  if (status === 429) return "A API limitou as chamadas. Aguarde e teste de novo."
  if (status >= 500) return "O servidor da API falhou ao responder."
  if (status >= 300 && status < 400) return "A API pediu um redirecionamento sem destino."
  return ""
}

function fieldsOf(value: JsonValue): { fields: string[]; more: number } {
  const paths: string[] = []
  const walk = (entry: JsonValue, path: string, depth: number) => {
    if (Array.isArray(entry) || isRecord(entry)) {
      const keys = Array.isArray(entry) ? (entry.length ? ["0"] : []) : Object.keys(entry)
      if (!keys.length || depth >= FIELD_DEPTH) {
        if (path) paths.push(path)
        return
      }
      for (const key of keys) walk((entry as Record<string, JsonValue>)[key], path ? `${path}.${key}` : key, depth + 1)
      return
    }
    if (path) paths.push(path)
  }
  walk(value, "", 0)
  return { fields: paths.slice(0, FIELD_LIMIT), more: Math.max(0, paths.length - FIELD_LIMIT) }
}

function previewOf(response: TestApiResponse): string {
  const text = response.json !== undefined ? JSON.stringify(response.json) ?? "" : typeof response.text === "string" ? response.text.replace(/\s+/g, " ").trim() : ""
  return clip(text, PREVIEW_LIMIT)
}

export function statusLabel(status: number, statusText?: unknown): string {
  const text = typeof statusText === "string" ? statusText.replace(/\s+/g, " ").trim() : ""
  return text ? `${status} ${clip(text, 60)}` : String(status)
}

export function classifyResponse(response: TestApiResponse): CallOutcome {
  const timeMs = typeof response.timeMs === "number" && Number.isFinite(response.timeMs) ? Math.max(0, Math.round(response.timeMs)) : undefined
  const timing = timeMs === undefined ? {} : { timeMs }
  if (response.error) {
    const known = isRecord(response.error) && typeof response.error.code === "string" && has(TEST_ERROR_MESSAGES, response.error.code)
    const message = known && typeof response.error.message === "string" && response.error.message.trim() ? response.error.message.trim() : TEST_ERROR_MESSAGES[known ? response.error.code : "unknown"]
    return { valid: false, message, ...timing, fields: [], moreFields: 0, preview: "" }
  }
  const status = response.status
  if (typeof status !== "number" || !Number.isInteger(status)) return { valid: false, message: TEST_ERROR_MESSAGES.unknown, ...timing, fields: [], moreFields: 0, preview: "" }
  const { fields, more } = response.json === undefined || response.json === null ? { fields: [], more: 0 } : fieldsOf(response.json)
  const shown = { status, ...timing, fields, moreFields: more, preview: previewOf(response) }
  const label = statusLabel(status, response.statusText)
  if (status < 200 || status > 299) {
    const hint = statusHint(status)
    return { valid: false, message: `A API respondeu com status ${label}.${hint ? ` ${hint}` : ""}`, ...shown }
  }
  if (response.truncated) return { valid: false, message: TOO_LARGE, ...shown }
  return { valid: true, message: `Respondeu com status ${label}${timeMs === undefined ? "" : ` em ${formatDuration(timeMs)}`}.`, ...shown }
}

export function failedOutcome(code: TestErrorCode, message?: string): CallOutcome {
  return classifyResponse({ ok: false, error: testError(code, message) })
}
