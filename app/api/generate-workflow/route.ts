import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

const WorkflowSchema = z.object({
    nodes: z.array(
        z.object({
            id: z.string(),
            type: z.enum(["start", "sendMessage", "options", "process", "conditional", "code", "finalizar"]),
            position: z.object({
                x: z.number(),
                y: z.number(),
            }),
            data: z.object({
                label: z.string(),
                customId: z.string().optional(),
                description: z.string().optional(),
                message: z.string().optional(),
                options: z
                    .array(
                        z.object({
                            id: z.string(),
                            text: z.string(),
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
    ),
    edges: z.array(
        z.object({
            id: z.string(),
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().optional(),
            targetHandle: z.string().optional(),
            type: z.string().optional(),
        }),
    ),
    nodeCounters: z.record(z.number()).optional(),
})

export async function POST(req: Request) {
    try {
        const { description, size, model, apiKey, imageUrl, additionalContext } = await req.json()

        if (!apiKey || !apiKey.startsWith("sk-")) {
            return Response.json(
                {
                    success: false,
                    error: "Chave da API OpenAI inválida. Deve começar com 'sk-'",
                },
                { status: 400 },
            )
        }

        const nodeLimits: Record<string, { min: number; max: number }> = {
            small: { min: 3, max: 5 },
            medium: { min: 6, max: 10 },
            large: { min: 11, max: 20 },
            custom: { min: 3, max: 30 },
        }

        const limits = nodeLimits[size] || nodeLimits.medium

        const prompt = `Você é um especialista em criar workflows de chatbot. Crie um workflow completo e funcional baseado na seguinte descrição: "${description}".

${additionalContext ? `Contexto adicional: ${additionalContext}` : ""}

FORMATO EXATO REQUERIDO:
Você DEVE gerar um JSON com esta estrutura EXATA:
{
  "nodes": [
    {
      "id": "start-node",
      "type": "start",
      "position": { "x": 250, "y": 50 },
      "data": {
        "label": "INÍCIO",
        "description": "Ponto de início do fluxo"
      },
      "deletable": false,
      "draggable": true
    },
    {
      "id": "welcome-msg",
      "type": "sendMessage",
      "position": { "x": 250, "y": 200 },
      "data": {
        "label": "Mensagem de Boas-vindas",
        "message": "Olá! Bem-vindo ao sistema!",
        "customId": "#1"
      },
      "draggable": true
    },
    {
      "id": "main-menu",
      "type": "options",
      "position": { "x": 250, "y": 350 },
      "data": {
        "label": "Menu Principal",
        "message": "Como posso ajudar?",
        "options": [
          { "id": "opt1", "text": "Opção 1" },
          { "id": "opt2", "text": "Opção 2" }
        ],
        "customId": "#2"
      },
      "draggable": true
    },
    {
      "id": "end-node",
      "type": "finalizar",
      "position": { "x": 250, "y": 500 },
      "data": {
        "label": "Finalizar",
        "message": "Obrigado!",
        "customId": "#3"
      },
      "draggable": true
    }
  ],
  "edges": [
    {
      "id": "start-to-welcome",
      "source": "start-node",
      "target": "welcome-msg",
      "type": "custom"
    },
    {
      "id": "welcome-to-menu",
      "source": "welcome-msg",
      "target": "main-menu",
      "type": "custom"
    },
    {
      "id": "menu-opt1-to-end",
      "source": "main-menu",
      "sourceHandle": "output-0",
      "target": "end-node",
      "type": "custom"
    }
  ],
  "nodeCounters": {
    "sendMessage": 1,
    "options": 1,
    "finalizar": 1
  }
}

REGRAS OBRIGATÓRIAS:
1. O workflow DEVE ter entre ${limits.min} e ${limits.max} nós
2. SEMPRE comece com um nó "start" com id "start-node" em position {x: 250, y: 50}
3. SEMPRE termine com pelo menos um nó "finalizar"
4. Todos os nós DEVEM ter "draggable": true (exceto start que tem "deletable": false)
5. Posicionamento:
   - Espaçamento vertical: 150px entre nós
   - Espaçamento horizontal: 200-300px para ramificações
   - Comece em x: 250, y: 50 para o start
6. Conexões:
   - Todas as edges DEVEM ter "type": "custom"
   - Para nós "options", use "sourceHandle": "output-0", "output-1", etc para cada opção
   - IDs das edges devem ser descritivos: "start-to-welcome", "menu-to-info", etc
7. customId:
   - Numere sequencialmente: "#1", "#2", "#3", etc
   - Não use customId no nó start
8. Mensagens:
   - Devem ser claras, profissionais e em português
   - Use emojis quando apropriado para tornar mais amigável
9. Tipos de nós disponíveis:
   - start: Ponto de início (obrigatório, apenas 1)
   - sendMessage: Envia mensagem (data.message obrigatório)
   - options: Apresenta opções (data.message e data.options obrigatórios)
   - process: Processa dados
   - conditional: Ramificação condicional
   - code: Executa código
   - finalizar: Finaliza o fluxo
10. nodeCounters:
    - Conte quantos nós de cada tipo foram criados (exceto start)
    - Exemplo: {"sendMessage": 2, "options": 1, "finalizar": 1}

${imageUrl ? `\n\nIMPORTANTE: Uma imagem de referência foi fornecida. Analise a estrutura visual do fluxo na imagem e recrie-a fielmente, mantendo a mesma sequência de nós e conexões.` : ""}

IMPORTANTE: Gere APENAS o JSON válido, sem texto adicional. O JSON deve ser compatível com ReactFlow e seguir EXATAMENTE o formato do exemplo acima.`

        console.log("[v0] Gerando workflow com ChatGPT...")
        console.log("[v0] Descrição:", description)
        console.log("[v0] Tamanho:", size)
        console.log("[v0] Modelo:", model || "gpt-4o")

        const selectedModel = model || "gpt-4o"

        const openai = createOpenAI({
            apiKey: apiKey,
        })

        const result = await generateObject({
            model: openai.chat(selectedModel), // CORRIGIDO para AI SDK 5
            schema: WorkflowSchema,
            prompt: prompt,
            temperature: 0.7,
        })

        console.log("[v0] Workflow gerado com sucesso!")
        console.log("[v0] Número de nós:", result.object.nodes.length)
        console.log("[v0] Número de conexões:", result.object.edges.length)

        return Response.json({
            success: true,
            workflow: result.object,
            prompt: prompt,
            metadata: {
                model: selectedModel,
                nodeCount: result.object.nodes.length,
                edgeCount: result.object.edges.length,
                size: size,
            },
        })
    } catch (error: any) {
        console.error("[v0] Erro ao gerar workflow:", error)
        return Response.json(
            {
                success: false,
                error: error.message || "Erro ao gerar workflow",
            },
            { status: 500 },
        )
    }
}
