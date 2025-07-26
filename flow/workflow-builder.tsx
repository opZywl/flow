"use client"

import type React from "react"
import { useState, useCallback, useRef, useEffect } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from "reactflow"
import "reactflow/dist/style.css"
import { toast } from "@/hooks/use-toast"
import { NodeLibrary } from "./node-library"
import { NodeConfigPanel } from "./node-config-panel"
import { CustomEdge } from "./custom-edge"
import { SendMessageNode } from "./nodes/send-message-node"
import { OptionsNode } from "./nodes/options-node"
import { ProcessNode } from "./nodes/process-node"
import { ConditionalNode } from "./nodes/conditional-node"
import { CodeNode } from "./nodes/code-node"
import { StartNode } from "./nodes/start-node"
import { FinalizarNode } from "./nodes/finalizar-node"
import { generateNodeId, createNode } from "./utils/workflow-utils"
import type { WorkflowNode } from "./utils/types"

const nodeTypes: NodeTypes = {
  sendMessage: (props) => (
    <SendMessageNode
      {...props}
      onRemove={() => removeNodeById(props.id)}
      onUpdateData={(data) => updateNodeDataById(props.id, data)}
    />
  ),
  options: (props) => (
    <OptionsNode
      {...props}
      onRemove={() => removeNodeById(props.id)}
      onUpdateData={(data) => updateNodeDataById(props.id, data)}
    />
  ),
  process: (props) => <ProcessNode {...props} onRemove={() => removeNodeById(props.id)} />,
  conditional: (props) => <ConditionalNode {...props} onRemove={() => removeNodeById(props.id)} />,
  code: (props) => <CodeNode {...props} onRemove={() => removeNodeById(props.id)} />,
  finalizar: (props) => <FinalizarNode {...props} onRemove={() => removeNodeById(props.id)} />,
  start: StartNode,
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
}

let removeNodeById: (id: string) => void = () => {}
let updateNodeDataById: (id: string, data: any) => void = () => {}

// Fluxo padrão que sempre funciona - COMPLETAMENTE CONECTADO
const createDefaultWorkflow = () => {
  const defaultNodes = [
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
    {
      id: "welcome-message",
      type: "sendMessage",
      position: { x: 250, y: 200 },
      data: {
        label: "Mensagem de Boas-vindas",
        message: "Olá! Bem-vindo ao AURA! 🤖\n\nSou seu assistente virtual e estou aqui para ajudar você.",
        customId: "#1",
      },
      draggable: true,
    },
    {
      id: "main-options",
      type: "options",
      position: { x: 250, y: 320 },
      data: {
        label: "Menu Principal",
        message: "Como posso ajudar você hoje?",
        options: [
          { id: "opt1", text: "Informações sobre produtos" },
          { id: "opt2", text: "Suporte técnico" },
          { id: "opt3", text: "Falar com atendente" },
        ],
        customId: "#2",
      },
      draggable: true,
    },
    {
      id: "info-produtos",
      type: "sendMessage",
      position: { x: 50, y: 480 },
      data: {
        label: "Informações Produtos",
        message:
          "📦 Nossos produtos incluem:\n\n• Soluções de IA\n• Chatbots inteligentes\n• Automação de processos\n• Integração com sistemas",
        customId: "#3",
      },
      draggable: true,
    },
    {
      id: "suporte-tecnico",
      type: "sendMessage",
      position: { x: 250, y: 480 },
      data: {
        label: "Suporte Técnico",
        message:
          "🔧 Para suporte técnico:\n\n• Acesse nossa documentação\n• Envie um email para suporte@aura.com\n• Ou continue conversando comigo!",
        customId: "#4",
      },
      draggable: true,
    },
    {
      id: "atendente",
      type: "finalizar",
      position: { x: 450, y: 480 },
      data: {
        label: "Transferir Atendente",
        message:
          "👨‍💼 Transferindo você para um atendente humano...\n\nAguarde um momento que alguém da nossa equipe entrará em contato!",
        customId: "#5",
      },
      draggable: true,
    },
    {
      id: "finalizar-info",
      type: "finalizar",
      position: { x: 50, y: 600 },
      data: {
        label: "Finalizar Informações",
        message:
          "Espero que estas informações sobre nossos produtos tenham sido úteis! Posso ajudar com mais alguma coisa?",
        customId: "#6",
      },
      draggable: true,
    },
    {
      id: "finalizar-suporte",
      type: "finalizar",
      position: { x: 250, y: 600 },
      data: {
        label: "Finalizar Suporte",
        message: "Espero ter ajudado com suas dúvidas técnicas! Se precisar de mais suporte, estamos à disposição.",
        customId: "#7",
      },
      draggable: true,
    },
  ]

  const defaultEdges = [
    {
      id: "start-to-welcome",
      source: "start-node",
      target: "welcome-message",
      type: "custom",
    },
    {
      id: "welcome-to-options",
      source: "welcome-message",
      target: "main-options",
      type: "custom",
    },
    {
      id: "option1-to-info",
      source: "main-options",
      sourceHandle: "output-0",
      target: "info-produtos",
      type: "custom",
    },
    {
      id: "option2-to-suporte",
      source: "main-options",
      sourceHandle: "output-1",
      target: "suporte-tecnico",
      type: "custom",
    },
    {
      id: "option3-to-atendente",
      source: "main-options",
      sourceHandle: "output-2",
      target: "atendente",
      type: "custom",
    },
    {
      id: "info-to-finalizar",
      source: "info-produtos",
      target: "finalizar-info",
      type: "custom",
    },
    {
      id: "suporte-to-finalizar",
      source: "suporte-tecnico",
      target: "finalizar-suporte",
      type: "custom",
    },
  ]

  return {
    nodes: defaultNodes,
    edges: defaultEdges,
    nodeCounters: {
      sendMessage: 3,
      options: 1,
      finalizar: 3,
    },
  }
}

const createEmptyWorkflow = () => {
  const emptyNodes = [
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

  return {
    nodes: emptyNodes,
    edges: [],
    nodeCounters: {},
  }
}

interface WorkflowBuilderProps {
  onActionsReady?: (actions: any) => void
  onStartPositionChange?: (position: { x: number; y: number }) => void
  onMousePositionChange?: (position: { x: number; y: number }) => void
  onComponentCountChange?: (count: number) => void
  onNodesChange?: (nodes: any[]) => void
  onEdgesChange?: (edges: any[]) => void
  showSidebar?: boolean
  onToggleSidebar?: () => void
  onOpenBot?: () => void
}

function WorkflowBuilderInner({
  onActionsReady,
  onStartPositionChange,
  onMousePositionChange,
  onComponentCountChange,
  onNodesChange,
  onEdgesChange,
  showSidebar = true,
  onToggleSidebar,
  onOpenBot,
}: WorkflowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState([])
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  const [nodeCounters, setNodeCounters] = useState<Record<string, number>>({})
  const { zoomIn, zoomOut, fitView, setCenter } = useReactFlow()

  // Garantir persistência do localStorage
  const WORKFLOW_KEY = "workflow"
  const EXECUTED_KEY = "executedFlow"

  // Carregar fluxo salvo ou criar padrão
  useEffect(() => {
    const loadSavedWorkflow = () => {
      try {
        const savedWorkflow = localStorage.getItem(WORKFLOW_KEY)
        if (savedWorkflow) {
          const workflow = JSON.parse(savedWorkflow)
          setNodes(workflow.nodes || [])
          setEdges(workflow.edges || [])
          setNodeCounters(workflow.nodeCounters || {})

          toast({
            title: "✅ Fluxo carregado",
            description: "Fluxo salvo anteriormente foi restaurado",
          })
          return
        }
      } catch (error) {
        console.error("Erro ao carregar fluxo salvo:", error)
      }

      // Se não há fluxo salvo, criar o padrão
      const defaultWorkflow = createDefaultWorkflow()
      setNodes(defaultWorkflow.nodes)
      setEdges(defaultWorkflow.edges)
      setNodeCounters(defaultWorkflow.nodeCounters)

      // Salvar o fluxo padrão
      localStorage.setItem(WORKFLOW_KEY, JSON.stringify(defaultWorkflow))
      localStorage.setItem(EXECUTED_KEY, "true")

      toast({
        title: "🚀 Fluxo padrão carregado",
        description: "Um fluxo de demonstração foi criado e está pronto para uso!",
      })
    }

    loadSavedWorkflow()
  }, [setNodes, setEdges])

  const removeNode = useCallback(
    (nodeId: string) => {
      if (nodeId === "start-node") {
        toast({
          title: "Não é possível remover",
          description: "O nó INÍCIO não pode ser removido",
          variant: "destructive",
        })
        return
      }

      setNodes((nds) => nds.filter((node) => node.id !== nodeId))
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
      setSelectedNode(null)

      toast({
        title: "Nó removido",
        description: "O nó foi removido com sucesso",
      })
    },
    [setNodes, setEdges],
  )

  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          }
          return node
        }),
      )
    },
    [setNodes],
  )

  removeNodeById = removeNode
  updateNodeDataById = updateNodeData

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      if (params.source === params.target) {
        toast({
          title: "❌ Auto-conexão não permitida",
          description: "Um nó não pode se conectar consigo mesmo",
          variant: "destructive",
        })
        return
      }

      setEdges((currentEdges) => {
        const sourceOccupied = currentEdges.some(
          (edge) => edge.source === params.source && edge.sourceHandle === params.sourceHandle,
        )

        const targetOccupied = currentEdges.some(
          (edge) => edge.target === params.target && edge.targetHandle === params.targetHandle,
        )

        if (targetOccupied) {
          toast({
            title: "❌ Entrada já ocupada",
            description: "Esta entrada amarela já possui uma conexão. Remova a conexão existente primeiro.",
            variant: "destructive",
          })
          return currentEdges
        }

        const filteredEdges = currentEdges.filter(
          (edge) => !(edge.source === params.source && edge.sourceHandle === params.sourceHandle),
        )

        const newEdges = addEdge({ ...params, type: "custom" }, filteredEdges)

        if (sourceOccupied) {
          toast({
            title: "🔄 Saída substituída",
            description: "A conexão anterior da saída verde foi removida e uma nova foi criada",
          })
        } else {
          toast({
            title: "✅ Conexão criada",
            description: "Nova conexão estabelecida com sucesso",
          })
        }

        return newEdges
      })
    },
    [setEdges],
  )

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const generateSimpleId = useCallback(
    (type: string) => {
      setNodeCounters((prev) => {
        const newCount = (prev[type] || 0) + 1
        return { ...prev, [type]: newCount }
      })
      const currentCount = (nodeCounters[type] || 0) + 1
      return `#${currentCount}`
    },
    [nodeCounters],
  )

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect()
      const type = event.dataTransfer.getData("application/reactflow")

      if (typeof type === "undefined" || !type || type === "start") {
        return
      }

      if (reactFlowBounds && reactFlowInstance) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        })

        const newNode = createNode({
          type,
          position,
          id: generateNodeId(type),
        })

        const simpleId = generateSimpleId(type)
        newNode.data = {
          ...newNode.data,
          customId: simpleId,
        }

        setNodes((nds) => nds.concat(newNode))
      }
    },
    [reactFlowInstance, setNodes, generateSimpleId],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "start-node") {
      return
    }
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const saveWorkflow = useCallback(() => {
    if (nodes.length <= 1) {
      toast({
        title: "❌ Fluxo vazio",
        description: "Adicione pelo menos um componente ao seu fluxo antes de salvar",
        variant: "destructive",
      })
      return
    }

    // SEMPRE salvar o estado atual dos nodes e edges com chave persistente
    const workflow = { nodes, edges, nodeCounters }
    const workflowString = JSON.stringify(workflow)
    localStorage.setItem(WORKFLOW_KEY, workflowString)

    // Também limpar o status de execução para forçar nova execução
    localStorage.removeItem(EXECUTED_KEY)
    window.dispatchEvent(new Event("storage"))

    toast({
      title: "✅ Fluxo salvo com sucesso!",
      description: `${nodes.length} componentes salvos e prontos para execução`,
    })
  }, [nodes, edges, nodeCounters])

  const executeWorkflow = useCallback(() => {
    if (nodes.length <= 1) {
      toast({
        title: "Nada para executar",
        description: "Adicione alguns nós ao seu fluxo primeiro",
        variant: "destructive",
      })
      return
    }

    // PRIMEIRO: Salvar o estado atual no localStorage com chave persistente
    const workflow = { nodes, edges, nodeCounters }
    const workflowString = JSON.stringify(workflow)
    localStorage.setItem(WORKFLOW_KEY, workflowString)

    // DEPOIS: Marcar como executado com chave persistente
    localStorage.setItem(EXECUTED_KEY, "true")

    toast({
      title: "✅ Fluxo executado com sucesso!",
      description: "Fluxo atual salvo e executado - bot Aura atualizado!",
    })

    window.dispatchEvent(new Event("storage"))

    return true
  }, [nodes, edges, nodeCounters])

  const resetWorkflow = useCallback(() => {
    const emptyWorkflow = createEmptyWorkflow()
    setNodes(emptyWorkflow.nodes)
    setEdges(emptyWorkflow.edges)
    setNodeCounters(emptyWorkflow.nodeCounters)
    setSelectedNode(null)

    localStorage.setItem(WORKFLOW_KEY, JSON.stringify(emptyWorkflow))
    localStorage.removeItem(EXECUTED_KEY)
    window.dispatchEvent(new Event("storage"))

    toast({
      title: "🧹 Fluxo resetado",
      description: "Todos os componentes foram removidos. Apenas o nó INÍCIO permanece.",
    })
  }, [setNodes, setEdges])

  // Auto-salvar a cada mudança
  useEffect(() => {
    if (nodes.length > 0) {
      const workflow = { nodes, edges, nodeCounters }
      localStorage.setItem(WORKFLOW_KEY, JSON.stringify(workflow))
    }
  }, [nodes, edges, nodeCounters])

  useEffect(() => {
    if (onActionsReady) {
      onActionsReady({
        zoomIn,
        zoomOut,
        fitView,
        save: saveWorkflow,
        execute: executeWorkflow,
        reset: resetWorkflow,
      })
    }
  }, [zoomIn, zoomOut, fitView, saveWorkflow, executeWorkflow, resetWorkflow, onActionsReady])

  return (
    <div className="flex h-full">
      {showSidebar && (
        <div className="w-64 border-r p-4 bg-black border-gray-800 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Componentes</h2>
          </div>
          <NodeLibrary />
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeInternal}
            onEdgesChange={onEdgesChangeInternal}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{ type: "custom" }}
            className="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#4a5568" gap={20} size={3} variant="dots" />
            <Controls showZoom={false} showFitView={false} showInteractive={false} />
            <MiniMap
              nodeColor={(node: Node) => {
                switch (node.type) {
                  case "start":
                    return "#8B5CF6"
                  case "sendMessage":
                    return "#3B82F6"
                  case "options":
                    return "#8B5CF6"
                  case "finalizar":
                    return "#EF4444"
                  default:
                    return "#06B6D4"
                }
              }}
              maskColor="rgba(0, 0, 0, 0.6)"
              style={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
          </ReactFlow>
        </div>
      </div>

      {selectedNode && (
        <div className="w-80 border-l p-4 bg-black border-gray-800 transition-all duration-300">
          <NodeConfigPanel
            node={selectedNode as WorkflowNode}
            updateNodeData={updateNodeData}
            onClose={() => setSelectedNode(null)}
            onRemove={() => removeNode(selectedNode.id)}
          />
        </div>
      )}
    </div>
  )
}

export default function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  )
}
