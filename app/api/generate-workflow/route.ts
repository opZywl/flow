import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

const WorkflowSchema = z.object({
    nodes: z
        .array(
            z.object({
                id: z.string().min(1, "Node ID cannot be empty"),
                type: z.enum(["start", "sendMessage", "options", "process", "conditional", "code", "finalizar"], {
                    errorMap: () => ({
                        message:
                            "Invalid node type. Must be one of: start, sendMessage, options, process, conditional, code, finalizar",
                    }),
                }),
                position: z.object({
                    x: z.number().finite("X position must be a valid number"),
                    y: z.number().finite("Y position must be a valid number"),
                }),
                data: z.object({
                    label: z.string().min(1, "Label cannot be empty"),
                    customId: z.string().optional(),
                    description: z.string().optional(),
                    message: z.string().optional(),
                    options: z
                        .array(
                            z.object({
                                id: z.string().min(1, "Option ID cannot be empty"),
                                text: z.string().min(1, "Option text cannot be empty"),
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
        .min(2, "Workflow must have at least 2 nodes (start + one other)"),
    edges: z.array(
        z.object({
            id: z.string().min(1, "Edge ID cannot be empty"),
            source: z.string().min(1, "Source node ID cannot be empty"),
            target: z.string().min(1, "Target node ID cannot be empty"),
            sourceHandle: z.string().optional(),
            targetHandle: z.string().optional(),
            type: z.string().optional(),
        }),
    ),
    nodeCounters: z.record(z.number().nonnegative()).optional(),
})

function validateWorkflowIntegrity(workflow: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check if there's exactly one start node
    const startNodes = workflow.nodes.filter((n: any) => n.type === "start")
    if (startNodes.length === 0) {
        errors.push("Workflow must have exactly one start node")
    } else if (startNodes.length > 1) {
        errors.push("Workflow cannot have more than one start node")
    }

    // Check if start node has correct ID
    if (startNodes.length === 1 && startNodes[0].id !== "start-node") {
        errors.push("Start node must have id 'start-node'")
    }

    // Check if all edges reference existing nodes
    const nodeIds = new Set(workflow.nodes.map((n: any) => n.id))
    workflow.edges.forEach((edge: any, index: number) => {
        if (!nodeIds.has(edge.source)) {
            errors.push(`Edge ${index} references non-existent source node: ${edge.source}`)
        }
        if (!nodeIds.has(edge.target)) {
            errors.push(`Edge ${index} references non-existent target node: ${edge.target}`)
        }
    })

    // Check if all edges have type "custom"
    workflow.edges.forEach((edge: any, index: number) => {
        if (!edge.type || edge.type !== "custom") {
            errors.push(`Edge ${index} (${edge.id}) must have type "custom", got: ${edge.type || "undefined"}`)
        }
    })

    // Check if sendMessage nodes have message
    workflow.nodes.forEach((node: any, index: number) => {
        if (node.type === "sendMessage" && (!node.data.message || node.data.message.trim() === "")) {
            errors.push(`SendMessage node ${index} (${node.id}) must have a non-empty message`)
        }
    })

    // Check if options nodes have options array
    workflow.nodes.forEach((node: any, index: number) => {
        if (node.type === "options") {
            if (!node.data.options || !Array.isArray(node.data.options) || node.data.options.length === 0) {
                errors.push(`Options node ${index} (${node.id}) must have at least one option`)
            }
        }
    })

    workflow.nodes.forEach((node: any) => {
        if (node.id !== "start-node") {
            const incomingEdges = workflow.edges.filter((edge: any) => edge.target === node.id)
            if (incomingEdges.length === 0) {
                const nodeLabel = node.data?.customId || node.data?.label || node.id
                errors.push(`Node ${nodeLabel} is not connected to start`)
                errors.push(`Node ${nodeLabel} has no incoming edges`)
            }
        }
    })

    workflow.nodes.forEach((node: any) => {
        if (node.type !== "finalizar" && node.id !== "start-node") {
            const outgoingEdges = workflow.edges.filter((edge: any) => edge.source === node.id)
            if (outgoingEdges.length === 0) {
                const nodeLabel = node.data?.customId || node.data?.label || node.id
                errors.push(`Node ${nodeLabel} has no outgoing edges (must connect to another node)`)
            }
        }
    })

    // Check if all nodes are connected to start (directly or indirectly)
    const connectedNodes = new Set<string>()
    const queue = ["start-node"]

    while (queue.length > 0) {
        const currentNode = queue.shift()!
        connectedNodes.add(currentNode)

        const connectedEdges = workflow.edges.filter((edge: any) => edge.source === currentNode)
        connectedEdges.forEach((edge: any) => {
            if (!connectedNodes.has(edge.target)) {
                queue.push(edge.target)
            }
        })
    }

    workflow.nodes.forEach((node: any) => {
        if (!connectedNodes.has(node.id)) {
            const nodeLabel = node.data?.customId || node.data?.label || node.id
            errors.push(`Node ${nodeLabel} is not reachable from start node`)
        }
    })

    return {
        valid: errors.length === 0,
        errors,
    }
}

export async function POST(req: Request) {
    try {
        const { description, size, customNodeCount, model, apiKey, imageUrl, additionalContext } = await req.json()

        if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
            return Response.json(
                {
                    success: false,
                    error: "Chave da API OpenAI inválida. Deve começar com 'sk-' e ser uma string válida",
                },
                { status: 400 },
            )
        }

        const nodeLimits: Record<string, { min: number; max: number; target: number }> = {
            small: { min: 3, max: 5, target: 4 },
            medium: { min: 6, max: 10, target: 8 },
            large: { min: 11, max: 20, target: 15 },
            custom: { min: 3, max: 30, target: 10 },
        }

        let limits = nodeLimits[size] || nodeLimits.medium

        if (size === "custom" && customNodeCount) {
            const count = Math.max(3, Math.min(30, customNodeCount))
            limits = { min: count, max: count, target: count }
        }

        const prompt = `Você é um especialista em criar workflows de chatbot. Crie um workflow completo e funcional baseado na seguinte descrição: "${description}".

${additionalContext ? `Contexto adicional: ${additionalContext}` : ""}

🚨🚨🚨 ATENÇÃO CRÍTICA - QUANTIDADE DE NÓS OBRIGATÓRIA 🚨🚨🚨

VOCÊ DEVE GERAR EXATAMENTE ${limits.target} NÓS NO TOTAL (incluindo o nó start).

${
            size === "custom"
                ? `O USUÁRIO SOLICITOU EXATAMENTE ${limits.target} NÓS. VOCÊ DEVE GERAR EXATAMENTE ${limits.target} NÓS, NEM MAIS, NEM MENOS!`
                : `QUANTIDADE MÍNIMA: ${limits.min} nós
QUANTIDADE MÁXIMA: ${limits.max} nós
QUANTIDADE ALVO: ${limits.target} nós (TENTE GERAR EXATAMENTE ESTA QUANTIDADE)`
        }

SE VOCÊ GERAR MENOS DE ${limits.min} NÓS OU MAIS DE ${limits.max} NÓS, O WORKFLOW SERÁ REJEITADO!

⚠️ FORMATO JSON OBRIGATÓRIO - SIGA EXATAMENTE ESTE MODELO ⚠️

Você DEVE gerar um JSON VÁLIDO seguindo EXATAMENTE esta estrutura:

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
    },
    {
      "id": "menu-opt2-to-end",
      "source": "main-menu",
      "sourceHandle": "output-1",
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

🔴 REGRAS CRÍTICAS - NUNCA VIOLE ESTAS REGRAS:

1. ✅ ESTRUTURA DOS NODES:
   - O workflow DEVE ter EXATAMENTE ${limits.target} nós no total (incluindo o start)
   - SEMPRE comece com um nó "start" com id EXATAMENTE "start-node"
   - Position do start DEVE ser {x: 250, y: 50}
   - SEMPRE termine com pelo menos um nó "finalizar"
   - Todos os nós DEVEM ter "draggable": true
   - O nó start DEVE ter "deletable": false
   - Todos os IDs devem ser únicos e em kebab-case: "welcome-msg", "main-menu"

2. ✅ POSICIONAMENTO VERTICAL:
   - Start node: y: 50
   - Próximo nó: y: 200 (diferença de 150px)
   - Próximo nó: y: 350 (diferença de 150px)
   - Próximo nó: y: 500 (diferença de 150px)
   - Continue com diferença de 150px entre níveis

3. ✅ POSICIONAMENTO HORIZONTAL:
   - Nó central: x: 250
   - Ramificação esquerda: x: 50 (diferença de 200px)
   - Ramificação direita: x: 450 (diferença de 200px)
   - Para 3 ramificações: x: 50, 250, 450

4. ✅ EDGES (CONEXÕES) - CRÍTICO:
   - TODAS as edges DEVEM ter "type": "custom" (OBRIGATÓRIO!)
   - Para nós "options", use "sourceHandle": "output-0", "output-1", "output-2"
   - IDs das edges devem ser descritivos: "start-to-welcome", "menu-to-info"
   - Cada edge DEVE conectar nós existentes
   - NUNCA deixe um nó sem conexão de entrada (exceto start)
   - NUNCA deixe um nó sem conexão de saída (exceto finalizar)
   - 🚨 CRÍTICO: TODO NÓ "finalizar" DEVE TER PELO MENOS UMA EDGE DE ENTRADA!
   - 🚨 CRÍTICO: NENHUM NÓ PODE FICAR ISOLADO SEM CONEXÕES!

5. ✅ CUSTOM IDs:
   - Numere sequencialmente: "#1", "#2", "#3", "#4", etc
   - NÃO use customId no nó start
   - Todos os outros nós DEVEM ter customId

6. ✅ MENSAGENS E CONTEÚDO:
   - Devem ser claras, profissionais e em português
   - Use emojis quando apropriado (mas não exagere)
   - Nós "sendMessage" DEVEM ter data.message não vazio e com conteúdo relevante
   - Nós "options" DEVEM ter data.message e data.options
   - NUNCA deixe mensagens vazias, undefined ou genéricas como "Mensagem não configurada"
   - SEMPRE crie mensagens específicas e contextualizadas para o workflow

7. ✅ TIPOS DE NÓS DISPONÍVEIS:
   - start: Ponto de início (obrigatório, apenas 1, id="start-node")
   - sendMessage: Envia mensagem (data.message obrigatório e específico)
   - options: Apresenta opções (data.message e data.options obrigatórios)
   - process: Processa dados
   - conditional: Ramificação condicional
   - code: Executa código
   - finalizar: Finaliza o fluxo (DEVE ter pelo menos uma edge de entrada!)

8. ✅ OPTIONS NODE - ESTRUTURA:
   - Cada opção DEVE ter "id" e "text"
   - IDs das opções: "opt1", "opt2", "opt3", etc
   - Para cada opção, crie uma edge com sourceHandle correspondente
   - Opção 0 → "sourceHandle": "output-0"
   - Opção 1 → "sourceHandle": "output-1"
   - Opção 2 → "sourceHandle": "output-2"

9. ✅ NODE COUNTERS:
   - Conte quantos nós de cada tipo foram criados (exceto start)
   - Exemplo: {"sendMessage": 2, "options": 1, "finalizar": 1}

10. ✅ CONECTIVIDADE COMPLETA - REGRA MAIS IMPORTANTE:
    - 🚨 TODOS os nós devem estar conectados ao start (direta ou indiretamente)
    - 🚨 NENHUM nó pode ficar isolado sem conexões
    - 🚨 TODO nó "finalizar" DEVE ter pelo menos UMA edge apontando para ele
    - 🚨 Se você criar um nó "finalizar", VOCÊ DEVE criar uma edge que aponte para ele
    - Cada nó sendMessage ou options DEVE ter uma saída
    - Cada nó (exceto start) DEVE ter uma entrada
    - EXEMPLO CORRETO: start → sendMessage → options → finalizar (todas conectadas!)
    - EXEMPLO ERRADO: start → sendMessage, finalizar (finalizar isolado!)

11. ✅ EVITAR NÓS DUPLICADOS - REGRA CRÍTICA:
    - 🚨 NUNCA crie múltiplos nós "finalizar" com o mesmo propósito!
    - 🚨 Se várias opções levam ao fim, TODAS devem apontar para o MESMO nó "finalizar"!
    - 🚨 Só crie múltiplos nós "finalizar" se eles tiverem propósitos DIFERENTES (ex: "Finalizar com Sucesso" vs "Finalizar com Erro")
    - 🚨 REUTILIZE nós sempre que possível - não duplique funcionalidades!
    - EXEMPLO CORRETO: options → (opt1, opt2, opt3) → MESMO nó finalizar
    - EXEMPLO ERRADO: options → opt1 → finalizar-1, opt2 → finalizar-2 (duplicação desnecessária!)
    - Se você precisa de múltiplos fins, dê nomes DIFERENTES e propósitos CLAROS: "finalizar-sucesso", "finalizar-erro", "finalizar-cancelado"

🚨 FLUXO LINEAR OBRIGATÓRIO:
- O fluxo DEVE ser linear e conectado: start → nó1 → nó2 → ... → finalizar
- NUNCA crie nós "finalizar" isolados
- SEMPRE conecte o último nó antes do finalizar AO nó finalizar
- Se houver opções, TODAS as opções devem levar a algum lugar (não deixe opções sem saída)
- 🚨 IMPORTANTE: Se múltiplas opções levam ao fim, REUTILIZE o mesmo nó "finalizar"!

${imageUrl ? `\n\n📸 IMPORTANTE: Uma imagem de referência foi fornecida. Analise a estrutura visual do fluxo na imagem e recrie-a fielmente, mantendo a mesma sequência de nós e conexões.` : ""}

🚨 VALIDAÇÃO FINAL ANTES DE GERAR:
- ✅ Verifique se você gerou EXATAMENTE ${limits.target} nós (conte: 1 start + ${limits.target - 1} outros)
- ✅ Verifique se TODAS as edges têm "type": "custom"
- ✅ Verifique se o nó start tem id "start-node"
- ✅ Verifique se todos os nós têm IDs únicos
- ✅ Verifique se todas as conexões referenciam nós existentes
- ✅ Verifique se nós sendMessage têm mensagens específicas e não vazias
- ✅ Verifique se nós options têm opções e mensagens
- ✅ Verifique se todos os nós estão conectados ao start
- ✅ 🚨 VERIFIQUE SE TODOS OS NÓS "finalizar" TÊM PELO MENOS UMA EDGE DE ENTRADA!
- ✅ 🚨 VERIFIQUE SE NÃO HÁ NENHUM NÓ ISOLADO SEM CONEXÕES!
- ✅ 🚨 VERIFIQUE SE NÃO HÁ NÓS DUPLICADOS DESNECESSÁRIOS (especialmente "finalizar")!

LEMBRE-SE: VOCÊ DEVE GERAR EXATAMENTE ${limits.target} NÓS! CONTE OS NÓS ANTES DE RETORNAR O JSON!

IMPORTANTE: Gere APENAS o JSON válido, sem texto adicional. O JSON deve ser compatível com ReactFlow e seguir EXATAMENTE o formato do exemplo acima.`

        console.log("Gerando workflow com ChatGPT...")
        console.log("Descrição:", description)
        console.log("Tamanho:", size, `(${limits.min}-${limits.max} nós, alvo: ${limits.target})`)
        console.log("Quantidade exata solicitada:", limits.target)
        console.log("Modelo:", model || "gpt-4o")

        const selectedModel = model || "gpt-4o"

        const openai = createOpenAI({
            apiKey: apiKey,
        })

        const result = await generateObject({
            model: openai(selectedModel),
            schema: WorkflowSchema,
            prompt: prompt,
            temperature: 0.7,
        })

        console.log("Workflow gerado!")
        console.log("Número de nós gerados:", result.object.nodes.length)
        console.log("Número de nós esperados:", limits.target)
        console.log("Número de conexões:", result.object.edges.length)

        if (result.object.nodes.length < limits.min || result.object.nodes.length > limits.max) {
            console.error(
                `Quantidade de nós inválida: ${result.object.nodes.length} (esperado: ${limits.min}-${limits.max})`,
            )
            return Response.json(
                {
                    success: false,
                    error: `A IA gerou ${result.object.nodes.length} nós, mas o esperado era entre ${limits.min} e ${limits.max} nós`,
                    validationErrors: [
                        `Quantidade de nós inválida: ${result.object.nodes.length} (esperado: ${limits.min}-${limits.max})`,
                        `Por favor, tente novamente. A IA deve gerar exatamente ${limits.target} nós.`,
                    ],
                    workflow: result.object,
                },
                { status: 400 },
            )
        }

        const integrityCheck = validateWorkflowIntegrity(result.object)

        if (!integrityCheck.valid) {
            console.error("Workflow validation failed:", integrityCheck.errors)
            return Response.json(
                {
                    success: false,
                    error: "Workflow gerado contém erros de validação",
                    validationErrors: integrityCheck.errors,
                    workflow: result.object,
                },
                { status: 400 },
            )
        }

        console.log("Workflow passou em todas as validações!")
        console.log("Quantidade de nós correta:", result.object.nodes.length)

        return Response.json({
            success: true,
            workflow: result.object,
            prompt: prompt,
            metadata: {
                model: selectedModel,
                nodeCount: result.object.nodes.length,
                edgeCount: result.object.edges.length,
                size: size,
                requestedNodeCount: limits.target,
                validated: true,
            },
        })
    } catch (error: any) {
        console.error("Erro ao gerar workflow:", error)

        let errorMessage = "Erro ao gerar workflow"
        let errorDetails = error.message || "Erro desconhecido"

        if (error.name === "ZodError") {
            errorMessage = "Erro de validação do schema"
            errorDetails = error.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ") || errorDetails
        }

        return Response.json(
            {
                success: false,
                error: errorMessage,
                details: errorDetails,
                stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
            },
            { status: 500 },
        )
    }
}
