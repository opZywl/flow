import type { WorkflowNode, XYPosition } from "./types"

export const generateNodeId = (type: string): string => {
  return `${type}-${Date.now()}`
}

export const createNode = ({
  type,
  position,
  id,
}: {
  type: string
  position: XYPosition
  id: string
}): WorkflowNode => {
  const baseNode: WorkflowNode = {
    id,
    type,
    position,
    data: { label: `Novo ${type}` },
  }

  // Configurações específicas por tipo
  switch (type) {
    case "sendMessage":
      return { ...baseNode, data: { ...baseNode.data, message: "Nova mensagem" } }
    case "options":
      return {
        ...baseNode,
        data: { ...baseNode.data, message: "Escolha uma opção", options: [{ id: "opt1", text: "Opção 1" }] },
      }
    case "finalizar":
      baseNode.data.message = "Conversa finalizada. Obrigado!"
      break
    case "input":
      baseNode.data.placeholder = "Digite aqui..."
      break
    case "process":
      baseNode.data.operation = "Processar dados"
      break
    case "output":
      baseNode.data.message = "Resposta do sistema"
      break
    case "conditional":
      baseNode.data.condition = "Se condição for verdadeira"
      break
    case "code":
      baseNode.data.code = "// Seu código aqui\nconsole.log('Hello World');"
      break
  }

  return baseNode
}

const getDefaultLabel = (type: string): string => {
  const labels: Record<string, string> = {
    start: "INÍCIO",
    sendMessage: "Enviar Mensagem",
    options: "Opções",
    finalizar: "Finalizar",
    input: "Entrada",
    process: "Processar",
    output: "Saída",
    conditional: "Condição",
    code: "Código",
  }

  return labels[type] || type
}

export const initialNodes: WorkflowNode[] = [
  {
    id: "start-node",
    type: "start",
    position: { x: 250, y: 100 },
    data: {
      label: "INÍCIO",
      description: "Ponto de início do fluxo",
    },
    deletable: false,
    draggable: true,
  },
]

export const initialEdges = []
