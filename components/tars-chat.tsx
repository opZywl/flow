"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CardContent, CardFooter } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Send, Bot } from "lucide-react"
import { useChat } from "ai/react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"

export default function AuraChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { theme } = useTheme()

  // Estado para armazenar o fluxo carregado
  const [savedFlow, setSavedFlow] = useState<any>(null)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [waitingForUserInput, setWaitingForUserInput] = useState(false)
  const [currentOptions, setCurrentOptions] = useState<any[]>([])
  const [currentOptionsMessage, setCurrentOptionsMessage] = useState("")
  const [isFlowExecuted, setIsFlowExecuted] = useState(false)
  const [flowLoaded, setFlowLoaded] = useState(false)

  // Chaves persistentes para localStorage - MESMAS DO WORKFLOW BUILDER
  const WORKFLOW_KEY = "workflow"
  const EXECUTED_KEY = "executedFlow"

  // Carregar fluxo do localStorage
  const loadWorkflow = () => {
    try {
      console.log("🔍 Tentando carregar fluxo...")

      const savedWorkflow = localStorage.getItem(WORKFLOW_KEY)
      const isExecuted = localStorage.getItem(EXECUTED_KEY) === "true"

      console.log("📦 Workflow no localStorage:", savedWorkflow ? "ENCONTRADO" : "NÃO ENCONTRADO")
      console.log("✅ Status de execução:", isExecuted ? "EXECUTADO" : "NÃO EXECUTADO")

      if (!savedWorkflow) {
        console.log("❌ Nenhum workflow salvo encontrado")
        return null
      }

      if (!isExecuted) {
        console.log("❌ Workflow não foi executado ainda")
        return null
      }

      const workflow = JSON.parse(savedWorkflow)
      console.log("✅ Workflow carregado com sucesso:", {
        nodes: workflow.nodes?.length || 0,
        edges: workflow.edges?.length || 0,
      })

      return workflow
    } catch (error) {
      console.error("❌ Erro ao carregar workflow:", error)
      return null
    }
  }

  // Inicializar mensagens baseado no fluxo
  const getInitialMessages = () => {
    const workflow = loadWorkflow()

    if (workflow && workflow.nodes && workflow.nodes.length > 1) {
      setFlowLoaded(true)
      return [
        {
          id: "flow-ready",
          role: "assistant",
          content: "✅ Olá! Fluxo carregado e pronto para uso.\n\nDigite qualquer mensagem para começar!",
        },
      ]
    } else {
      setFlowLoaded(false)
      return [
        {
          id: "no-flow",
          role: "assistant",
          content: "❌ Nenhum fluxo foi configurado.\n\nPor favor, acesse o painel administrativo para criar um fluxo.",
        },
      ]
    }
  }

  // Inicializar chat
  const { input: chatInput, handleInputChange: chatHandleInputChange } = useChat({
    api: "/api/chat",
    initialMessages: getInitialMessages(),
  })

  const [messages, setMessages] = useState([{ role: "bot", content: "Hello! How can I assist you today?" }])
  const [input, setInput] = useState("")

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (input.trim()) {
      setMessages([...messages, { role: "user", content: input }])
      setInput("")
      // Simulate bot response
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "bot", content: `You said: "${input}". How else can I help?` }])
      }, 1000)
    }
  }

  // Carregar fluxo quando abrir o chat
  useEffect(() => {
    if (isOpen) {
      console.log("🚀 Chat aberto, carregando fluxo...")
      const workflow = loadWorkflow()
      setSavedFlow(workflow)
      setIsFlowExecuted(localStorage.getItem(EXECUTED_KEY) === "true")

      // Atualizar mensagens baseado no fluxo atual
      const newMessages = getInitialMessages()
      setMessages(newMessages)
    }
  }, [isOpen])

  // Listener para mudanças no localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      if (isOpen) {
        console.log("🔄 Detectada mudança no localStorage")
        const workflow = loadWorkflow()
        setSavedFlow(workflow)
        setIsFlowExecuted(localStorage.getItem(EXECUTED_KEY) === "true")

        // Atualizar mensagens
        const newMessages = getInitialMessages()
        setMessages(newMessages)
      }
    }

    window.addEventListener("storage", handleStorageChange)
    const interval = setInterval(handleStorageChange, 3000) // Verificar a cada 3 segundos

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      clearInterval(interval)
    }
  }, [isOpen])

  // Scroll ao final dos mensagens quando se añade uno nuevo
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Enfocar el input quando se abre el chat
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, isMinimized])

  // Funções para processar o fluxo
  const findNextNode = (currentNodeId: string, optionIndex?: number) => {
    if (!savedFlow) return null

    const edges = savedFlow.edges
    let targetEdge

    if (optionIndex !== undefined) {
      // Para nós de opções, encontrar a edge específica baseada no índice
      const nodeEdges = edges.filter((edge: any) => edge.source === currentNodeId)
      targetEdge = nodeEdges[optionIndex]
    } else {
      // Para outros nós, encontrar a primeira edge
      targetEdge = edges.find((edge: any) => edge.source === currentNodeId)
    }

    if (targetEdge) {
      return savedFlow.nodes.find((node: any) => node.id === targetEdge.target)
    }

    return null
  }

  const processNode = (node: any) => {
    setCurrentNodeId(node.id)
    console.log("🔄 Processando nó:", node.id, node.type, node.data?.customId)

    if (node.type === "sendMessage") {
      const message = node.data.message || "Mensagem não configurada"

      // Adicionar mensagem do bot
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: message,
        },
      ])

      // Continuar automaticamente para o próximo nó após 1 segundo
      setTimeout(() => {
        const nextNode = findNextNode(node.id)
        if (nextNode) {
          processNode(nextNode)
        } else {
          setWaitingForUserInput(false)
          setCurrentNodeId(null)
          console.log("✅ Fluxo finalizado - nenhum próximo nó")
        }
      }, 1500)
    } else if (node.type === "options") {
      const message = node.data.message || "Escolha uma opção:"
      const options = node.data.options || []

      // Salvar opções atuais para repetir se necessário
      setCurrentOptions(options)
      setCurrentOptionsMessage(message)

      let optionsText = message + "\n\n"
      options.forEach((option: any, index: number) => {
        optionsText += `${index + 1}. ${option.text}\n`
      })
      optionsText += "\n💡 Digite o número da opção desejada"

      // Adicionar mensagem com opções
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: optionsText,
        },
      ])

      // Aguardar input do usuário
      setWaitingForUserInput(true)
      console.log("⏳ Aguardando seleção do usuário...")
    } else if (node.type === "finalizar") {
      const message = node.data.message || "Conversa finalizada. Obrigado!"

      // Adicionar mensagem final
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: message + "\n\n✅ Conversa finalizada!",
        },
      ])

      setCurrentNodeId(null)
      setWaitingForUserInput(false)
      console.log("🏁 Conversa finalizada")
    }
  }

  const startFlow = () => {
    if (!savedFlow || !savedFlow.nodes) {
      console.log("⚠️ Nenhum fluxo disponível para iniciar")
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "❌ Erro: Nenhum fluxo configurado encontrado.",
        },
      ])
      return
    }

    console.log("🚀 Iniciando fluxo...")

    // Encontrar o nó START
    const startNode = savedFlow.nodes.find((node: any) => node.id === "start-node")
    if (startNode) {
      // Encontrar o primeiro nó conectado ao START
      const firstNode = findNextNode("start-node")
      if (firstNode) {
        console.log("✅ Primeiro nó encontrado:", firstNode.id, firstNode.data?.customId)
        processNode(firstNode)
      } else {
        console.log("⚠️ Nenhum nó conectado ao START")
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "⚠️ Fluxo não está configurado corretamente - nenhum nó conectado ao início.",
          },
        ])
      }
    } else {
      console.log("⚠️ Nó START não encontrado")
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "⚠️ Fluxo inválido - nó de início não encontrado.",
        },
      ])
    }
  }

  const repeatOptions = () => {
    if (currentOptions.length > 0) {
      let optionsText = "❌ Opção inválida! " + currentOptionsMessage + "\n\n"
      currentOptions.forEach((option: any, index: number) => {
        optionsText += `${index + 1}. ${option.text}\n`
      })
      optionsText += "\n💡 Digite apenas o número da opção (1, 2, 3...)"

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: optionsText,
        },
      ])
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Don't drag if clicking on buttons (except the drag handle areas)
    if (target.closest("button") && !target.closest(".drag-handle")) {
      return
    }

    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y

    // Constrain to viewport
    const maxX = isOpen ? window.innerWidth - 384 : window.innerWidth - 56 // 384px chat width, 56px icon width
    const maxY = isOpen ? window.innerHeight - 500 : window.innerHeight - 56 // 500px chat height, 56px icon height

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.userSelect = "none" // Prevent text selection while dragging
    } else {
      document.body.style.userSelect = ""
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.userSelect = ""
    }
  }, [isDragging, dragStart, isOpen])

  const toggleChat = () => {
    if (isMinimized) {
      setIsMinimized(false)
    } else {
      setIsOpen(!isOpen)
    }
  }

  const minimizeChat = () => {
    setIsMinimized(true)
  }

  const maximizeChat = () => {
    setIsMinimized(false)
  }

  const closeChat = () => {
    setIsOpen(false)
    setIsMinimized(false)
    // Reset do estado quando fechar
    setCurrentNodeId(null)
    setWaitingForUserInput(false)
    setCurrentOptions([])
    setCurrentOptionsMessage("")
  }

  const chatStyle = {
    left: `${24 + position.x}px`,
    bottom: `${24 + position.y}px`,
    cursor: isDragging ? "grabbing" : "grab",
  }

  return (
    <>
      {/* Botão para abrir o chat - draggable when not open */}
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="fixed z-50 drag-handle"
          style={chatStyle}
          onMouseDown={handleMouseDown}
        >
          <Button
            onClick={toggleChat}
            className="rounded-full w-14 h-14 bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 shadow-lg shadow-black/50 flex items-center justify-center transition-all duration-300 hover:scale-105"
          >
            <Bot className="h-6 w-6 text-gray-200" />
          </Button>
        </motion.div>
      )}

      {/* Ventana de chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, height: "auto" }}
            animate={{
              opacity: 1,
              y: 0,
              height: isMinimized ? "60px" : "500px",
            }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed w-full max-w-sm bg-gray-900 rounded-xl shadow-2xl overflow-hidden z-50 border border-gray-800"
            style={chatStyle}
            onMouseDown={handleMouseDown}
          >
            {/* Header del chat */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-3 flex items-center justify-between border-b border-gray-800 drag-handle">
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8 bg-gray-700">
                  <div className="flex items-center justify-center h-full w-full">
                    <Bot className="h-5 w-5 text-gray-200" />
                  </div>
                </Avatar>
                <div>
                  <h3 className="text-sm font-medium text-gray-200">AURA</h3>
                  <p className="text-xs text-gray-400">{flowLoaded ? "Fluxo Ativo" : "Sem Fluxo"}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {isMinimized ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={maximizeChat}
                    className="h-7 w-7 text-muted-foreground hover:text-card-foreground"
                  >
                    <Bot className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={minimizeChat}
                    className="h-7 w-7 text-muted-foreground hover:text-card-foreground"
                  >
                    <Bot className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeChat}
                  className="h-7 w-7 text-muted-foreground hover:text-card-foreground"
                >
                  <Bot className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Contenido del chat (solo visible si no está minimizado) */}
            {!isMinimized && (
              <>
                {/* Mensajes */}
                <CardContent className="space-y-4 h-80 overflow-y-auto">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex items-start ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "bot" && (
                        <Avatar className="mr-2">
                          <AvatarImage src="/placeholder-bot.jpg" />
                          <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`p-3 rounded-lg max-w-[70%] ${
                          msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <Avatar className="ml-2">
                          <AvatarImage src="/placeholder-user.jpg" />
                          <AvatarFallback>You</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </CardContent>

                {/* Input para enviar mensagens */}
                <CardFooter className="flex space-x-2">
                  <Input
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") handleSendMessage()
                    }}
                  />
                  <Button onClick={handleSendMessage}>
                    <Send className="h-5 w-5" />
                  </Button>
                </CardFooter>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botão "Fale com AURA" */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-6 flex justify-center"
      >
        <Button
          onClick={toggleChat}
          variant="outline"
          className="text-lg px-6 py-2 border-2 border-border bg-card/80 backdrop-blur-lg text-card-foreground hover:bg-card hover:text-foreground rounded-xl flex items-center space-x-2 transition-all duration-300 hover:scale-105"
        >
          <Bot className="h-5 w-5" />
          <span>Fale com AURA</span>
        </Button>
      </motion.div>
    </>
  )
}
