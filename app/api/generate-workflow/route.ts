import { APICallError, NoObjectGeneratedError, RetryError, generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import { exportFlow, importFlow, isObject } from "@/lib/atendimento/format"
import type { AtendimentoFlow } from "@/lib/atendimento/types"

export const maxDuration = 60

const WorkflowSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1, "O ID do componente não pode ficar vazio."),
        type: z.enum(["start", "sendMessage", "options", "finalizar"], {
          errorMap: () => ({
            message: "Tipo de componente inválido. Use start, sendMessage, options ou finalizar.",
          }),
        }),
        position: z.object({
          x: z.number().finite("A posição x deve ser um número válido."),
          y: z.number().finite("A posição y deve ser um número válido."),
        }),
        data: z.object({
          label: z.string().min(1, "O rótulo do componente não pode ficar vazio."),
          customId: z.string().optional(),
          description: z.string().optional(),
          message: z.string().optional(),
          options: z
            .array(
              z.object({
                id: z.string().min(1, "O ID da opção não pode ficar vazio."),
                text: z.string().min(1, "O texto da opção não pode ficar vazio."),
              }),
            )
            .optional(),
          condition: z.string().optional(),
          code: z.string().optional(),
          finalizationType: z.string().optional(),
          finalMessage: z.string().optional(),
        }),
        deletable: z.boolean().optional(),
        draggable: z.boolean().optional(),
      }),
    )
    .min(2, "O fluxo deve ter ao menos 2 componentes: o início e mais um."),
  edges: z.array(
    z.object({
      id: z.string().min(1, "O ID da conexão não pode ficar vazio."),
      source: z.string().min(1, "A origem da conexão não pode ficar vazia."),
      target: z.string().min(1, "O destino da conexão não pode ficar vazio."),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
      type: z.string().optional(),
    }),
  ),
  nodeCounters: z.record(z.number().nonnegative()).optional(),
})

type GeneratedWorkflow = z.infer<typeof WorkflowSchema>
type GeneratedNode = GeneratedWorkflow["nodes"][number]
type Size = "small" | "medium" | "large" | "custom"

interface Limits {
  min: number
  max: number
  target: number
}

interface ModelProfile {
  name: string
  structuredOutputs: boolean
  vision: boolean
}

const START_NODE_ID = "start-node"
const DEFAULT_MODEL = "gpt-4o"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+=*)$/i
const FETCH_FAILURES = ["fetch failed", "failed to fetch"]

const SIZES: Size[] = ["small", "medium", "large", "custom"]

const SIZE_LIMITS: Record<Size, Limits> = {
  small: { min: 3, max: 5, target: 4 },
  medium: { min: 6, max: 10, target: 8 },
  large: { min: 11, max: 20, target: 15 },
  custom: { min: 3, max: 30, target: 10 },
}

const MODEL_PROFILES = new Map<string, ModelProfile>([
  ["gpt-4o", { name: "GPT-4o", structuredOutputs: true, vision: true }],
  ["gpt-4o-mini", { name: "GPT-4o mini", structuredOutputs: true, vision: true }],
  ["gpt-4-turbo", { name: "GPT-4 Turbo", structuredOutputs: false, vision: true }],
  ["gpt-3.5-turbo", { name: "GPT-3.5 Turbo", structuredOutputs: false, vision: false }],
])

const EXAMPLE: GeneratedWorkflow = {
  nodes: [
    { id: START_NODE_ID, type: "start", position: { x: 0, y: 0 }, data: { label: "Início" } },
    {
      id: "boas-vindas",
      type: "sendMessage",
      position: { x: 300, y: 0 },
      data: { label: "Boas-vindas", message: "Olá! Você está no atendimento da Clínica Exemplo." },
    },
    {
      id: "menu-principal",
      type: "options",
      position: { x: 600, y: 0 },
      data: {
        label: "Menu principal",
        message: "Como podemos ajudar?",
        options: [
          { id: "opt1", text: "Agendar consulta" },
          { id: "opt2", text: "Encerrar atendimento" },
        ],
      },
    },
    {
      id: "agendamento",
      type: "sendMessage",
      position: { x: 900, y: 0 },
      data: { label: "Agendamento", message: "Para agendar, acesse o portal do paciente ou ligue para a recepção." },
    },
    { id: "encerrar", type: "finalizar", position: { x: 1200, y: 150 }, data: { label: "Encerrar" } },
  ],
  edges: [
    { id: "inicio-boas-vindas", source: START_NODE_ID, target: "boas-vindas", type: "custom" },
    { id: "boas-vindas-menu", source: "boas-vindas", target: "menu-principal", type: "custom" },
    { id: "menu-agendamento", source: "menu-principal", sourceHandle: "output-0", target: "agendamento", type: "custom" },
    { id: "menu-encerrar", source: "menu-principal", sourceHandle: "output-1", target: "encerrar", type: "custom" },
    { id: "agendamento-encerrar", source: "agendamento", target: "encerrar", type: "custom" },
  ],
  nodeCounters: { sendMessage: 2, options: 1, finalizar: 1 },
}

function isSize(value: unknown): value is Size {
  return typeof value === "string" && (SIZES as string[]).includes(value)
}

function resolveLimits(size: Size, customNodeCount: unknown): Limits {
  const requested = Number(customNodeCount)
  if (size !== "custom" || !Number.isFinite(requested) || requested <= 0) return SIZE_LIMITS[size]
  const exact = Math.min(SIZE_LIMITS.custom.max, Math.max(SIZE_LIMITS.custom.min, Math.round(requested)))
  return { min: exact, max: exact, target: exact }
}

function expectedCount(limits: Limits): string {
  return limits.min === limits.max ? String(limits.target) : `de ${limits.min} a ${limits.max}`
}

function readImage(dataUrl: string): { mediaType: string; data: string } | null {
  const match = IMAGE_DATA_URL.exec(dataUrl)
  if (!match) return null
  const data = match[2]
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  const bytes = Math.floor((data.length * 3) / 4) - padding
  return bytes > MAX_IMAGE_BYTES ? null : { mediaType: match[1].toLowerCase(), data }
}

function flowName(description: string): string {
  const clean = description.replace(/\s+/g, " ").trim()
  if (!clean) return "Fluxo gerado por IA"
  if (clean.length <= 80) return clean
  const cut = clean.slice(0, 80)
  const space = cut.lastIndexOf(" ")
  return (space >= 40 ? cut.slice(0, space) : cut).trim()
}

function buildInstructions(limits: Limits): string {
  const quantity =
    limits.min === limits.max
      ? `Gere exatamente ${limits.target} nós, contando o nó de início.`
      : `Gere entre ${limits.min} e ${limits.max} nós, contando o nó de início. O ideal é ${limits.target}.`

  return [
    "Você cria fluxos de atendimento para chatbots. Responda somente com um objeto JSON no formato descrito abaixo.",
    "",
    "Quantidade de nós",
    `- ${quantity}`,
    "- Respostas fora dessa quantidade são rejeitadas.",
    "",
    "Tipos de nó",
    `- start: início do fluxo. Exatamente um, com id "${START_NODE_ID}". Não recebe conexões.`,
    "- sendMessage: envia uma mensagem. data.message é obrigatório.",
    "- options: apresenta um menu. data.message (até 1024 caracteres) e data.options são obrigatórios. Cada menu tem de 1 a 10 opções, cada uma com id e text.",
    "- finalizar: encerra o atendimento e não tem conexões de saída. Para enviar uma despedida, use um sendMessage antes dele.",
    "",
    "Campos de cada nó",
    '- id: único, em kebab-case, por exemplo "boas-vindas".',
    "- type: um dos tipos acima.",
    "- position: { x, y } com valores numéricos. O editor reorganiza o layout ao importar.",
    "- data.label: nome curto do nó.",
    "",
    "Conexões (edges)",
    '- Cada conexão tem id único, source, target e type "custom", e liga nós existentes.',
    "- start e sendMessage têm exatamente uma conexão de saída, sem sourceHandle.",
    '- options tem exatamente uma conexão por opção, com sourceHandle "output-N", em que N é a posição da opção a partir de zero: a primeira opção usa "output-0", a segunda usa "output-1" e assim por diante.',
    "- Todo nó, exceto start, recebe ao menos uma conexão e é alcançável a partir de start.",
    "- Quando várias opções encerram o atendimento da mesma forma, ligue todas ao mesmo nó finalizar. Crie mais de um finalizar somente para desfechos diferentes.",
    "",
    "nodeCounters",
    "- Quantidade de nós de cada tipo, sem contar o start.",
    "",
    "Conteúdo",
    "- Mensagens em português do Brasil, claras, profissionais e específicas para o cenário pedido, sem textos genéricos ou de preenchimento.",
    "- Use emojis somente se a solicitação pedir.",
    "",
    "Exemplo ilustrativo da estrutura, com 5 nós. Adapte o conteúdo e a quantidade ao que foi pedido:",
    JSON.stringify(EXAMPLE, null, 2),
  ].join("\n")
}

function buildRequest(description: string, context: string, hasImage: boolean): string {
  const sections = ["Solicitação"]
  if (description) sections.push(`Descrição do atendimento:\n${description}`)
  if (context) sections.push(`Contexto adicional:\n${context}`)
  if (hasImage) {
    sections.push(
      "Imagem de referência: anexada a esta mensagem. Reproduza as etapas, mensagens, opções e conexões mostradas nela.",
    )
  }
  return sections.join("\n\n")
}

function nodeName(node: GeneratedNode): string {
  return `“${node.data.label || node.id}”`
}

function validateWorkflowIntegrity(workflow: GeneratedWorkflow): string[] {
  const errors: string[] = []

  const starts = workflow.nodes.filter((node) => node.type === "start")
  if (starts.length === 0) errors.push("O fluxo não tem componente de início.")
  if (starts.length > 1) errors.push("O fluxo tem mais de um componente de início.")
  if (starts.length === 1 && starts[0].id !== START_NODE_ID) {
    errors.push(`O componente de início deve ter o ID "${START_NODE_ID}".`)
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id))
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Conexão “${edge.id}”: a origem “${edge.source}” não existe.`)
    if (!nodeIds.has(edge.target)) errors.push(`Conexão “${edge.id}”: o destino “${edge.target}” não existe.`)
    if (edge.type !== "custom") errors.push(`Conexão “${edge.id}”: o tipo deve ser "custom".`)
  }

  const incoming = new Set(workflow.edges.map((edge) => edge.target))
  const outgoing = new Set(workflow.edges.map((edge) => edge.source))
  for (const node of workflow.nodes) {
    if (node.type === "sendMessage" && !node.data.message?.trim()) {
      errors.push(`Componente ${nodeName(node)}: a mensagem está vazia.`)
    }
    if (node.type === "options" && !node.data.options?.length) {
      errors.push(`Componente ${nodeName(node)}: o menu não tem opções.`)
    }
    if (node.id === START_NODE_ID) continue
    if (!incoming.has(node.id)) errors.push(`Componente ${nodeName(node)}: não tem conexão de entrada.`)
    if (node.type !== "finalizar" && !outgoing.has(node.id)) {
      errors.push(`Componente ${nodeName(node)}: não tem conexão de saída.`)
    }
  }

  const reachable = new Set<string>()
  const queue = [START_NODE_ID]
  while (queue.length > 0) {
    const current = queue.shift() as string
    if (reachable.has(current)) continue
    reachable.add(current)
    for (const edge of workflow.edges) {
      if (edge.source === current && !reachable.has(edge.target)) queue.push(edge.target)
    }
  }
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id) && incoming.has(node.id)) {
      errors.push(`Componente ${nodeName(node)}: não é alcançável a partir do início.`)
    }
  }

  return errors
}

function describeFailure(error: unknown): { error: string; details: string } {
  const cause = RetryError.isInstance(error) && error.lastError ? error.lastError : error

  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode
    if (status === undefined) {
      return { error: "Não foi possível conectar à OpenAI.", details: "Verifique a conexão com a internet e tente novamente." }
    }
    if (status === 401) {
      return { error: "A OpenAI recusou a chave da API.", details: "Confira a chave informada e tente novamente." }
    }
    if (status === 403) {
      return { error: "A chave da API não tem acesso a este recurso.", details: cause.message }
    }
    if (status === 404) {
      return {
        error: "O modelo escolhido não está disponível para esta chave.",
        details: "Escolha outro modelo ou verifique o acesso da conta na OpenAI.",
      }
    }
    if (status === 429) {
      return {
        error: "Limite de uso da OpenAI atingido.",
        details: "Aguarde alguns instantes ou verifique os créditos da conta.",
      }
    }
    if (status >= 500) {
      return { error: "A OpenAI está indisponível no momento.", details: "Tente novamente em alguns instantes." }
    }
    return { error: "A OpenAI recusou a solicitação.", details: cause.message }
  }

  if (NoObjectGeneratedError.isInstance(cause)) {
    if (cause.finishReason === "length") {
      return {
        error: "A resposta do modelo foi interrompida por excesso de tamanho.",
        details: "Reduza a quantidade de componentes ou escolha um modelo com mais capacidade.",
      }
    }
    return {
      error: "A resposta do modelo não seguiu o formato esperado.",
      details: "Gere novamente ou escolha outro modelo.",
    }
  }

  if (cause instanceof TypeError && FETCH_FAILURES.includes(cause.message.toLowerCase())) {
    return { error: "Não foi possível conectar à OpenAI.", details: "Verifique a conexão com a internet e tente novamente." }
  }

  if (cause instanceof z.ZodError) {
    return {
      error: "A resposta do modelo não seguiu o formato esperado.",
      details: cause.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    }
  }

  return {
    error: "Não foi possível gerar o fluxo.",
    details: cause instanceof Error && cause.message ? cause.message : "Erro desconhecido.",
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }
  if (!isObject(body)) {
    return Response.json({ success: false, error: "Não foi possível ler a solicitação." }, { status: 400 })
  }

  try {
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (!apiKey.startsWith("sk-")) {
      return Response.json(
        { success: false, error: "Chave da API da OpenAI inválida. Ela deve começar com sk-." },
        { status: 400 },
      )
    }

    const description = typeof body.description === "string" ? body.description.trim() : ""
    const additionalContext = typeof body.additionalContext === "string" ? body.additionalContext.trim() : ""
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : ""
    const image = imageUrl ? readImage(imageUrl) : null

    if (imageUrl && !image) {
      return Response.json(
        { success: false, error: "Imagem de referência inválida. Envie um arquivo PNG, JPG ou WEBP de até 10 MB." },
        { status: 400 },
      )
    }
    if (!description && !image) {
      return Response.json(
        { success: false, error: "Descreva o fluxo ou envie uma imagem de referência." },
        { status: 400 },
      )
    }

    const modelId = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL
    const profile = MODEL_PROFILES.get(modelId) ?? { name: modelId, structuredOutputs: true, vision: true }
    if (image && !profile.vision) {
      return Response.json(
        { success: false, error: `O modelo ${profile.name} não analisa imagens. Escolha outro modelo.` },
        { status: 400 },
      )
    }

    const size: Size = isSize(body.size) ? body.size : "medium"
    const limits = resolveLimits(size, body.customNodeCount)
    const instructions = buildInstructions(limits)
    const request = buildRequest(description, additionalContext, Boolean(image))
    const prompt = `${instructions}\n\n${request}`

    const openai = createOpenAI({ apiKey })
    const result = await generateObject({
      model: profile.structuredOutputs ? openai(modelId) : openai.chat(modelId),
      schema: WorkflowSchema,
      system: instructions,
      messages: [
        {
          role: "user",
          content: image
            ? [
                { type: "text", text: request },
                { type: "image", image: image.data, mediaType: image.mediaType },
              ]
            : request,
        },
      ],
      temperature: 0.7,
      abortSignal: req.signal,
      providerOptions: profile.structuredOutputs ? undefined : { openai: { structuredOutputs: false } },
    })

    const workflow = result.object
    const nodeCount = workflow.nodes.length

    if (nodeCount < limits.min || nodeCount > limits.max) {
      return Response.json(
        {
          success: false,
          error: "A quantidade de componentes gerada está fora do esperado.",
          validationErrors: [`Componentes gerados: ${nodeCount}. Esperados: ${expectedCount(limits)}.`],
          workflow,
        },
        { status: 400 },
      )
    }

    const integrityErrors = validateWorkflowIntegrity(workflow)
    if (integrityErrors.length > 0) {
      return Response.json(
        {
          success: false,
          error: "O fluxo gerado tem pendências de estrutura.",
          validationErrors: integrityErrors,
          workflow,
        },
        { status: 400 },
      )
    }

    let compatibleWorkflow: AtendimentoFlow
    try {
      compatibleWorkflow = importFlow({
        ...workflow,
        name: image ? "Fluxo gerado por IA a partir de imagem" : flowName(description),
        description: image ? additionalContext : description,
      })
      exportFlow(compatibleWorkflow)
    } catch (conversionError) {
      return Response.json(
        {
          success: false,
          error: "O fluxo gerado não pôde ser convertido para o formato de Atendimento.",
          validationErrors: String((conversionError as Error).message).split("\n"),
          workflow,
        },
        { status: 400 },
      )
    }

    return Response.json({
      success: true,
      workflow: compatibleWorkflow,
      prompt,
      metadata: {
        model: modelId,
        nodeCount: compatibleWorkflow.nodes.length,
        edgeCount: compatibleWorkflow.edges.length,
        size,
        requestedNodeCount: limits.target,
        validated: true,
      },
    })
  } catch (error) {
    const failure = describeFailure(error)
    return Response.json(
      {
        success: false,
        error: failure.error,
        details: failure.details,
        stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
