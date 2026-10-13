import { LIMITS } from "@/lib/atendimento/ai/contracts"
import type { FailureCode, GenerateEvent, GenerateFailure, GenerateResponse, GenerationProgress } from "@/lib/atendimento/ai/contracts"
import { parseGenerationRequest, runGeneration } from "@/lib/atendimento/ai/runner"
import type { GenerationInput } from "@/lib/atendimento/ai/runner"

export const runtime = "nodejs"
export const maxDuration = 300

const DEADLINE_MS = 270_000
const HEARTBEAT_MS = 10_000
const READ_ERROR = "Não foi possível ler a solicitação."

const STATUS: Record<FailureCode, number> = {
  invalid_request: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  invalid_key: 502,
  forbidden: 502,
  billing: 502,
  model_not_found: 502,
  rate_limit: 502,
  provider_error: 502,
  provider_unavailable: 502,
  network: 502,
  timeout: 504,
  invalid_output: 422,
  output_too_long: 422,
  content_filter: 422,
  aborted: 499,
  unknown: 500,
}

function headers(type: string): Record<string, string> {
  return { "Content-Type": type, "Cache-Control": "no-store" }
}

function json(body: GenerateResponse, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: headers("application/json; charset=utf-8") })
}

function statusOf(body: GenerateResponse): number {
  return body.success ? 200 : STATUS[body.code]
}

function rejection(code: FailureCode, error: string): Response {
  const failure: GenerateFailure = { success: false, code, error }
  return json(failure, STATUS[code])
}

async function readBody(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!req.body) return ""
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function execute(input: GenerationInput, signal: AbortSignal, onProgress?: (progress: GenerationProgress) => void): Promise<GenerateResponse> {
  return runGeneration(input, { transport: "server", signal, deadlineMs: DEADLINE_MS, onProgress })
}

function stream(input: GenerationInput, req: Request): Response {
  const encoder = new TextEncoder()
  const cancel = new AbortController()
  const client = AbortSignal.any([req.signal, cancel.signal])
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      let last: GenerationProgress | null = null
      const write = (event: GenerateEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      heartbeat = setInterval(() => {
        if (last) write({ type: "progress", progress: last })
      }, HEARTBEAT_MS)
      void execute(input, client, (progress) => {
        last = progress
        write({ type: "progress", progress })
      }).then((result) => {
        write({ type: "result", result })
      }).finally(() => {
        clearInterval(heartbeat)
        open = false
        try {
          controller.close()
        } catch {
          return
        }
      })
    },
    cancel() {
      clearInterval(heartbeat)
      cancel.abort()
    },
  })
  return new Response(body, { status: 200, headers: { ...headers("application/x-ndjson; charset=utf-8"), "X-Accel-Buffering": "no" } })
}

export async function POST(req: Request): Promise<Response> {
  if (!/^application\/json(\s*;|\s*$)/i.test((req.headers.get("content-type") ?? "").trim())) return rejection("unsupported_media", "Envie a solicitação em JSON.")
  let text: string | null
  try {
    text = await readBody(req, LIMITS.bodyBytes)
  } catch {
    return rejection("invalid_request", READ_ERROR)
  }
  if (text === null) return rejection("payload_too_large", "A solicitação é grande demais.")
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return rejection("invalid_request", READ_ERROR)
  }
  const checked = parseGenerationRequest(body)
  if (!checked.ok) return json(checked.failure, STATUS[checked.failure.code])
  if (checked.request.stream) return stream(checked.request.input, req)
  const result = await execute(checked.request.input, req.signal)
  return json(result, statusOf(result))
}
