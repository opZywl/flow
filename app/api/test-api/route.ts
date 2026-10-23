import { createTestApiHandler } from "@/lib/atendimento/api-test-handler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 20

export const POST = createTestApiHandler()
