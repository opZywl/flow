import dns, { type LookupAddress, type LookupOptions } from "node:dns"
import http, { type IncomingMessage } from "node:http"
import https from "node:https"
import type { LookupFunction, Socket } from "node:net"
import { pipeline, type Readable } from "node:stream"
import zlib from "node:zlib"
import { TEST_LIMITS, blockedAddress, checkTestUrl, parseTestRequest, portOf, targetProblem, testError, type TestApiRequest, type TestApiResponse, type TestError, type TestErrorCode } from "./api-check"
import type { JsonValue } from "./types"

export type AllowPrivate = boolean | ((address: string, port: number) => boolean)
export type Resolver = (hostname: string) => Promise<LookupAddress[]>

export interface TestApiOptions {
  allowPrivate?: AllowPrivate
  resolve?: Resolver
  timeoutMs?: number
  rateLimit?: { limit: number; windowMs: number }
  now?: () => number
}

interface Settings {
  allowPrivate: (address: string, port: number) => boolean
  allowed: (address: string, port: number) => boolean
  resolve: Resolver
  timeoutMs: number
}

interface ReadBody {
  data: Buffer
  truncated: boolean
  readable: boolean
}

class Refused extends Error {
  constructor(readonly reason: TestErrorCode) {
    super(reason)
  }
}

const REQUEST_LIMIT = 512 * 1024
const RATE_LIMIT = { limit: 30, windowMs: 60_000 }
const RATE_ENTRIES = 10_000
const REDIRECT_STATUS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
const TEXT_LIMIT = 2000
const STATUS_TEXT_LIMIT = 120
const CONTENT_TYPE_LIMIT = 200
const JSON_LIMITS = { depth: 8, items: 20, keys: 100, text: 300, nodes: 2000 }
const USER_AGENT = "flow-api-test/1.0"
const ACCEPT = "application/json, text/plain, */*"
const JSON_TYPE = /^application\/json(\s*;|\s*$)/i
const DNS_CODES: ReadonlySet<string> = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME", "EAI_NODATA", "EAI_FAIL", "ENODATA"])
const UNREACHABLE_CODES: ReadonlySet<string> = new Set(["EHOSTUNREACH", "ENETUNREACH", "EADDRNOTAVAIL", "ENETDOWN", "EHOSTDOWN"])
const NETWORK_CODES: ReadonlySet<string> = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED", "ERR_STREAM_PREMATURE_CLOSE", "ABORT_ERR"])
const CERTIFICATE_CODE = /CERT|SIGNATURE|SELF_SIGNED|INVALID_CA|HOSTNAME_MISMATCH|ISSUER/
const TLS_CODE = /^(EPROTO|ERR_SSL|ERR_TLS)/
const DECODE_CODE = /^(Z_|ERR_BROTLI|ERR__ERROR|ERR_ZLIB)/
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"]
const BODY_HEADERS = ["content-type", "content-encoding", "content-language", "content-location"]

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text
const defaultResolve: Resolver = (hostname) => dns.promises.lookup(hostname, { all: true })

function reply(status: number, body: TestApiResponse, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } })
}

function refusal(code: TestErrorCode): TestApiResponse {
  return { ok: false, truncated: false, error: testError(code) }
}

function failure(error: TestError, timeMs: number, redirects: number): TestApiResponse {
  return { ok: false, timeMs, truncated: false, redirects, error }
}

function hostsOf(req: Request): string[] {
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")].flatMap((value) => value ? value.split(",").map((entry) => entry.trim().toLowerCase()) : [])
  try {
    hosts.push(new URL(req.url).host.toLowerCase())
  } catch {
    return hosts
  }
  return hosts
}

function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin") return false
  const origin = req.headers.get("origin")
  if (origin === null) return site === "same-origin"
  try {
    return hostsOf(req).includes(new URL(origin).host.toLowerCase())
  } catch {
    return false
  }
}

function clientOf(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || req.headers.get("x-real-ip")?.trim() || "local"
}

function limiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; reset: number }>()
  return (client: string, now: number): number => {
    if (hits.size >= RATE_ENTRIES) {
      for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key)
      for (const key of hits.keys()) {
        if (hits.size < RATE_ENTRIES) break
        hits.delete(key)
      }
    }
    const entry = hits.get(client)
    if (!entry || entry.reset <= now) {
      hits.set(client, { count: 1, reset: now + windowMs })
      return 0
    }
    if (entry.count >= limit) return Math.max(1, Math.ceil((entry.reset - now) / 1000))
    entry.count++
    return 0
  }
}

async function readRequest(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > REQUEST_LIMIT) return null
  if (!req.body) return ""
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > REQUEST_LIMIT) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function isJsonText(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function outgoingHeaders(pairs: Array<[string, string]>, body: string | undefined): Record<string, string> {
  const headers = new Map<string, [string, string]>()
  for (const [name, value] of pairs) {
    const key = name.toLowerCase()
    const current = headers.get(key)
    headers.set(key, current ? [current[0], `${current[1]}${key === "cookie" ? "; " : ", "}${value}`] : [name, value])
  }
  if (!headers.has("user-agent")) headers.set("user-agent", ["User-Agent", USER_AGENT])
  if (!headers.has("accept")) headers.set("accept", ["Accept", ACCEPT])
  if (body !== undefined && !headers.has("content-type")) headers.set("content-type", ["Content-Type", isJsonText(body) ? "application/json" : "text/plain; charset=utf-8"])
  return Object.fromEntries(headers.values())
}

function without(headers: Record<string, string>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !names.includes(name.toLowerCase())))
}

function pick(found: LookupAddress[], options: LookupOptions, port: number, settings: Settings): LookupAddress[] {
  const family = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0
  const addresses = found.filter((entry) => !family || entry.family === family)
  if (!addresses.length) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
  if (addresses.some((entry) => !settings.allowed(entry.address, port))) throw new Refused("blocked_address")
  return addresses
}

function guardedLookup(port: number, settings: Settings): LookupFunction {
  return (hostname, options, callback) => {
    settings.resolve(hostname)
      .then((found) => pick(found, options, port, settings))
      .then(
        (addresses) => process.nextTick(() => {
          if (options.all) callback(null, addresses)
          else callback(null, addresses[0].address, addresses[0].family)
        }),
        (error: NodeJS.ErrnoException) => process.nextTick(() => callback(error, "", 0)),
      )
  }
}

function exchange(url: URL, method: string, headers: Record<string, string>, body: string | undefined, signal: AbortSignal, settings: Settings): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const port = portOf(url)
    const options = { method, headers, agent: false as const, signal, lookup: guardedLookup(port, settings) }
    const request = url.protocol === "https:" ? https.request(url, options, resolve) : http.request(url, options, resolve)
    request.once("socket", (socket: Socket) => {
      socket.once("connect", () => {
        const address = socket.remoteAddress
        if (!address || !settings.allowed(address, port)) request.destroy(new Refused("blocked_address"))
      })
    })
    request.on("error", reject)
    request.end(body)
  })
}

async function readBody(response: IncomingMessage): Promise<ReadBody> {
  const encoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase()
  const decoder = encoding === "gzip" || encoding === "x-gzip" ? zlib.createGunzip() : encoding === "deflate" ? zlib.createInflate() : encoding === "br" ? zlib.createBrotliDecompress() : undefined
  const readable = decoder !== undefined || encoding === "" || encoding === "identity"
  const source: Readable = decoder ? pipeline(response, decoder, () => undefined) : response
  const chunks: Buffer[] = []
  let total = 0
  let truncated = false
  try {
    for await (const chunk of source) {
      const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      if (total + piece.length > TEST_LIMITS.response) {
        chunks.push(piece.subarray(0, TEST_LIMITS.response - total))
        truncated = true
        break
      }
      chunks.push(piece)
      total += piece.length
    }
  } catch (error) {
    if (decoder && DECODE_CODE.test(codeOf(error) ?? "")) return { data: Buffer.alloc(0), truncated: false, readable: false }
    throw error
  } finally {
    response.destroy()
    decoder?.destroy()
  }
  return { data: Buffer.concat(chunks), truncated, readable }
}

function decode(data: Buffer, contentType: string): string {
  const charset = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1]
  try {
    return new TextDecoder(charset || "utf-8").decode(data)
  } catch {
    return new TextDecoder("utf-8").decode(data)
  }
}

function prune(value: unknown, depth: number, budget: { left: number }): JsonValue {
  budget.left--
  if (typeof value === "string") return value.length > JSON_LIMITS.text ? `${value.slice(0, JSON_LIMITS.text)}…` : value
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) {
    const items: JsonValue[] = []
    if (depth >= JSON_LIMITS.depth) return items
    for (const entry of value.slice(0, JSON_LIMITS.items)) {
      if (budget.left <= 0) break
      items.push(prune(entry, depth + 1, budget))
    }
    return items
  }
  if (!isRecord(value)) return null
  const entries: Array<[string, JsonValue]> = []
  if (depth < JSON_LIMITS.depth) {
    for (const [key, entry] of Object.entries(value).slice(0, JSON_LIMITS.keys)) {
      if (budget.left <= 0) break
      entries.push([key, prune(entry, depth + 1, budget)])
    }
  }
  return Object.fromEntries(entries)
}

function describeResponse(response: IncomingMessage, read: ReadBody, timeMs: number, redirects: number): TestApiResponse {
  const status = response.statusCode ?? 0
  const contentType = String(response.headers["content-type"] ?? "").trim()
  const result: TestApiResponse = {
    ok: status >= 200 && status <= 299,
    status,
    statusText: clip((response.statusMessage ?? "").trim(), STATUS_TEXT_LIMIT),
    timeMs,
    ...(contentType ? { contentType: clip(contentType, CONTENT_TYPE_LIMIT) } : {}),
    truncated: read.truncated,
    redirects,
  }
  if (!read.readable || !read.data.length || read.data.subarray(0, 1024).includes(0)) return result
  const text = decode(read.data, contentType)
  if (!read.truncated && (/json/i.test(contentType) || /^\s*[[{]/.test(text))) {
    try {
      return { ...result, json: prune(JSON.parse(text), 0, { left: JSON_LIMITS.nodes }) }
    } catch {
      return { ...result, text: clip(text, TEXT_LIMIT) }
    }
  }
  return { ...result, text: clip(text, TEXT_LIMIT) }
}

function codeOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const own = (error as NodeJS.ErrnoException).code
  if (typeof own === "string") return own
  const cause = (error as { cause?: unknown }).cause
  return cause instanceof Error && typeof (cause as NodeJS.ErrnoException).code === "string" ? (cause as NodeJS.ErrnoException).code : undefined
}

function errorFrom(error: unknown, timedOut: boolean): TestError {
  if (timedOut) return testError("timeout")
  if (error instanceof Refused) return testError(error.reason)
  const code = codeOf(error) ?? ""
  if (DNS_CODES.has(code)) return testError("dns")
  if (code === "ECONNREFUSED") return testError("refused")
  if (UNREACHABLE_CODES.has(code)) return testError("unreachable")
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return testError("timeout")
  if (CERTIFICATE_CODE.test(code)) return testError("certificate")
  if (TLS_CODE.test(code)) return testError("tls")
  if (code.startsWith("HPE_")) return testError("invalid_response")
  if (NETWORK_CODES.has(code)) return testError("network")
  return testError("unknown")
}

async function perform(request: TestApiRequest, settings: Settings, client: AbortSignal): Promise<TestApiResponse> {
  const started = performance.now()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), settings.timeoutMs)
  const signal = AbortSignal.any([deadline.signal, client])
  const elapsed = () => Math.round(performance.now() - started)
  let url = new URL(request.url)
  let method: string = request.method
  let body = request.body
  let headers = outgoingHeaders(request.headers, body)
  let redirects = 0
  try {
    for (;;) {
      const problem = targetProblem(url, settings.allowPrivate)
      if (problem) return failure(problem, elapsed(), redirects)
      const response = await exchange(url, method, headers, body, signal, settings)
      const status = response.statusCode ?? 0
      const location = response.headers.location
      if (!REDIRECT_STATUS.has(status) || !location) return describeResponse(response, await readBody(response), elapsed(), redirects)
      response.destroy()
      if (redirects >= TEST_LIMITS.redirects) return failure(testError("too_many_redirects"), elapsed(), redirects)
      redirects++
      let next: URL
      try {
        next = new URL(location, url)
      } catch {
        return failure(testError("invalid_redirect"), elapsed(), redirects)
      }
      const checked = checkTestUrl(next.href)
      if (!checked.ok) return failure(testError("invalid_redirect"), elapsed(), redirects)
      if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
        method = "GET"
        body = undefined
        headers = without(headers, BODY_HEADERS)
      }
      if (checked.url.origin !== url.origin) headers = without(headers, CREDENTIAL_HEADERS)
      url = checked.url
    }
  } catch (error) {
    return failure(errorFrom(error, deadline.signal.aborted), elapsed(), redirects)
  } finally {
    clearTimeout(timer)
  }
}

export function createTestApiHandler(options: TestApiOptions = {}): (req: Request) => Promise<Response> {
  const allowPrivate = options.allowPrivate ?? false
  const privateAllowed = (address: string, port: number) => typeof allowPrivate === "function" ? allowPrivate(address, port) === true : allowPrivate === true
  const settings: Settings = {
    allowPrivate: privateAllowed,
    allowed: (address, port) => !blockedAddress(address) || privateAllowed(address, port),
    resolve: options.resolve ?? defaultResolve,
    timeoutMs: options.timeoutMs ?? TEST_LIMITS.timeoutMs,
  }
  const limit = limiter(options.rateLimit ?? RATE_LIMIT)
  const now = options.now ?? Date.now
  return async (req: Request): Promise<Response> => {
    try {
      if (!sameOrigin(req)) return reply(403, refusal("forbidden_origin"))
      const wait = limit(clientOf(req), now())
      if (wait) return reply(429, refusal("rate_limited"), { "Retry-After": String(wait) })
      if (!JSON_TYPE.test((req.headers.get("content-type") ?? "").trim())) return reply(415, refusal("unsupported_media"))
      const raw = await readRequest(req)
      if (raw === null) return reply(413, refusal("payload_too_large"))
      let input: unknown
      try {
        input = JSON.parse(raw)
      } catch {
        return reply(400, refusal("invalid_request"))
      }
      const parsed = parseTestRequest(input)
      if (!parsed.ok) return reply(400, { ok: false, truncated: false, error: parsed.error })
      return reply(200, await perform(parsed.request, settings, req.signal))
    } catch {
      return reply(500, refusal("unknown"))
    }
  }
}
