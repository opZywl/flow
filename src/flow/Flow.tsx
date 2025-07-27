"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { ThemeProvider, useTheme } from "../ThemeContext"
import ColorPanel from "../ColorPanel"
import WorkflowBuilder from "./workflow-builder"
import { useRouter } from "next/navigation"
import {
    FiArrowLeft,
    FiSearch,
    FiSave,
    FiPlayCircle,
    FiDownload,
    FiSun,
    FiMoon,
    FiZoomIn,
    FiZoomOut,
    FiMaximize,
    FiRefreshCw,
    FiMapPin,
    FiLayers,
    FiSidebar,
    FiX,
    FiMinimize2,
    FiMaximize2,
    FiSend,
    FiCheckCircle,
    FiXCircle,
    FiImage,
    FiSettings,
    FiCamera,
    FiFolder,
    FiTrash2,
} from "react-icons/fi"
import { BotIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar } from "@/components/ui/avatar"
import { motion, AnimatePresence } from "framer-motion"
import html2canvas from "html2canvas"

// Componente da barra lateral elegante para o flow
const FlowElegantSidebar = ({ currentGradient, theme }: { currentGradient: any; theme: string }) => {
    return (
        <div className="fixed left-0 top-0 h-full z-50 flex items-center pointer-events-none">
            <div
                className="h-[80%] w-[3px] rounded-full relative overflow-hidden panel-glow"
                style={{
                    background: `linear-gradient(to bottom, ${currentGradient.glow}, transparent, ${currentGradient.glow})`,
                }}
            >
                {/* Pontos decorativos */}
                <div
                    className="absolute top-[20%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? currentGradient.glow : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${currentGradient.glow}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />
                <div
                    className="absolute top-[50%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? currentGradient.glow : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${currentGradient.glow}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />
                <div
                    className="absolute top-[80%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? currentGradient.glow : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${currentGradient.glow}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />

                {/* Efeito de brilho */}
                <div
                    className="absolute top-0 left-0 w-full h-full"
                    style={{
                        background:
                            theme === "dark"
                                ? `linear-gradient(to bottom, ${currentGradient.primary}, transparent, ${currentGradient.secondary})`
                                : `linear-gradient(to bottom, #6B7280, transparent, #6B7280)`,
                        opacity: theme === "dark" ? 0.2 : 0.1,
                    }}
                />
            </div>
        </div>
    )
}

// Componente do Indicador de Status com status de execução
const FlowStatusIndicator = ({ startPosition, mousePosition, componentCount, theme, currentGradient }: any) => {
    const isDark = theme === "dark"
    const [isExecuted, setIsExecuted] = useState(false)

    useEffect(() => {
        const executedFlow = localStorage.getItem("executedFlow")
        setIsExecuted(executedFlow === "true")
    }, [])

    // Escutar mudanças no localStorage
    useEffect(() => {
        const handleStorageChange = () => {
            const executedFlow = localStorage.getItem("executedFlow")
            setIsExecuted(executedFlow === "true")
        }

        window.addEventListener("storage", handleStorageChange)
        // Também escutar mudanças internas
        const interval = setInterval(handleStorageChange, 1000)

        return () => {
            window.removeEventListener("storage", handleStorageChange)
            clearInterval(interval)
        }
    }, [])

    return (
        <div
            className={`flex items-center gap-4 px-3 py-1.5 rounded-lg border text-xs transition-all duration-200`}
            style={{
                background: isDark
                    ? `linear-gradient(135deg, rgba(0,0,0,0.8) 0%, ${currentGradient.primary}15 50%, rgba(0,0,0,0.8) 100%)`
                    : `linear-gradient(135deg, rgba(255,255,255,0.9) 0%, ${currentGradient.primary}10 50%, rgba(255,255,255,0.9) 100%)`,
                border: isDark ? `1px solid ${currentGradient.glow}40` : `1px solid ${currentGradient.primary}30`,
                boxShadow: isDark
                    ? `0 0 0 1px ${currentGradient.glow}20, 0 0 15px ${currentGradient.glow}25`
                    : `0 0 0 1px ${currentGradient.primary}20, 0 0 10px ${currentGradient.primary}15`,
                color: isDark ? "#f9fafb" : "#111827",
            }}
        >
            {/* Status de Execução */}
            <div className="flex items-center gap-1">
                {isExecuted ? (
                    <FiCheckCircle
                        className="h-3 w-3 text-green-500"
                        style={{
                            filter: `drop-shadow(0 0 4px rgba(34, 197, 94, 0.6))`,
                        }}
                    />
                ) : (
                    <FiXCircle
                        className="h-3 w-3 text-red-500"
                        style={{
                            filter: `drop-shadow(0 0 4px rgba(239, 68, 68, 0.6))`,
                        }}
                    />
                )}
                <span
                    className="font-semibold"
                    style={{
                        textShadow: isDark ? `0 0 6px ${currentGradient.glow}50` : `0 0 3px ${currentGradient.primary}30`,
                    }}
                >
          {isExecuted ? "EXECUTADO" : "NÃO EXECUTADO"}
        </span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? currentGradient.glow : currentGradient.primary,
                    opacity: 0.4,
                }}
            />

            {/* Posição do INÍCIO */}
            <div className="flex items-center gap-1">
                <FiMapPin
                    className="h-3 w-3"
                    style={{
                        color: currentGradient.glow,
                        filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
                    }}
                />
                <span
                    className="font-mono"
                    style={{
                        textShadow: isDark ? `0 0 4px ${currentGradient.glow}40` : `0 0 2px ${currentGradient.primary}30`,
                    }}
                >
          INÍCIO: ({Math.round(startPosition.x)}, {Math.round(startPosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? currentGradient.glow : currentGradient.primary,
                    opacity: 0.4,
                }}
            />

            {/* Posição do Mouse */}
            <div className="flex items-center gap-1">
        <span
            style={{
                filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
            }}
        >
          🖱️
        </span>
                <span
                    className="font-mono"
                    style={{
                        textShadow: isDark ? `0 0 4px ${currentGradient.glow}40` : `0 0 2px ${currentGradient.primary}30`,
                    }}
                >
          Mouse: ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? currentGradient.glow : currentGradient.primary,
                    opacity: 0.4,
                }}
            />

            {/* Contador de Componentes */}
            <div className="flex items-center gap-1">
                <FiLayers
                    className="h-3 w-3"
                    style={{
                        color: currentGradient.glow,
                        filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
                    }}
                />
                <span
                    style={{
                        textShadow: isDark ? `0 0 4px ${currentGradient.glow}40` : `0 0 2px ${currentGradient.primary}30`,
                    }}
                >
          <span className="font-semibold">{componentCount}</span> componentes
        </span>
            </div>
        </div>
    )
}

// Componente do Bot Aura usando o mesmo layout do TarsChat
const AuraFlowBot = ({
                         isOpen,
                         onClose,
                     }: {
    isOpen: boolean
    onClose: () => void
}) => {
    const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([])
    const [input, setInput] = useState("")
    const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
    const [isMinimized, setIsMinimized] = useState(false)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [savedFlow, setSavedFlow] = useState<{ nodes: any[]; edges: any[] } | null>(null)
    const [isFlowExecuted, setIsFlowExecuted] = useState(false)
    const [waitingForUserInput, setWaitingForUserInput] = useState(false)
    const [currentOptions, setCurrentOptions] = useState<any[]>([])
    const [currentOptionsMessage, setCurrentOptionsMessage] = useState("")

    // Carregar fluxo salvo quando o bot abrir
    useEffect(() => {
        if (isOpen) {
            const savedWorkflow = localStorage.getItem("workflow")
            const executedFlow = localStorage.getItem("executedFlow")

            if (savedWorkflow && executedFlow === "true") {
                try {
                    const workflow = JSON.parse(savedWorkflow)
                    setSavedFlow(workflow)
                    setIsFlowExecuted(true)

                    // Limpar mensagens anteriores e mostrar mensagem de boas-vindas
                    setMessages([
                        {
                            id: "welcome",
                            role: "assistant",
                            content: "Olá! Fluxo carregado e pronto para uso. Digite qualquer coisa para começar!",
                        },
                    ])
                } catch (error) {
                    console.error("Erro ao carregar fluxo:", error)
                    setMessages([
                        {
                            id: "error",
                            role: "assistant",
                            content: "Erro ao carregar o fluxo. Por favor, execute o fluxo novamente.",
                        },
                    ])
                }
            } else {
                // Se não há fluxo executado, mostrar mensagem
                setMessages([
                    {
                        id: "no-flow",
                        role: "assistant",
                        content:
                            "Nenhum fluxo foi executado ainda. Por favor, crie um fluxo, salve e execute para que eu possa funcionar.",
                    },
                ])
            }
        }
    }, [isOpen])

    // Adicionar listener para mudanças no localStorage
    useEffect(() => {
        const handleStorageChange = () => {
            if (isOpen) {
                const savedWorkflow = localStorage.getItem("workflow")
                const executedFlow = localStorage.getItem("executedFlow")

                if (savedWorkflow && executedFlow === "true") {
                    try {
                        const workflow = JSON.parse(savedWorkflow)
                        setSavedFlow(workflow)
                        setIsFlowExecuted(true)
                    } catch (error) {
                        console.error("Erro ao recarregar fluxo:", error)
                    }
                } else {
                    setSavedFlow(null)
                    setIsFlowExecuted(false)
                }
            }
        }

        window.addEventListener("storage", handleStorageChange)
        return () => window.removeEventListener("storage", handleStorageChange)
    }, [isOpen])

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

        if (node.type === "sendMessage") {
            const message = node.data.message || "Mensagem não configurada"
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
                }
            }, 1000)
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
        } else if (node.type === "finalizar") {
            const message = node.data.message || "Conversa finalizada. Obrigado!"
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: message,
                },
            ])
            setCurrentNodeId(null)
            setWaitingForUserInput(false)
        }
    }

    const startFlow = () => {
        if (!savedFlow) return

        // Encontrar o nó START
        const startNode = savedFlow.nodes.find((node: any) => node.id === "start-node")
        if (startNode) {
            // Encontrar o primeiro nó conectado ao START
            const firstNode = findNextNode("start-node")
            if (firstNode) {
                processNode(firstNode)
            }
        }
    }

    const repeatOptions = () => {
        if (currentOptions.length > 0) {
            let optionsText = currentOptionsMessage + "\n\n"
            currentOptions.forEach((option: any, index: number) => {
                optionsText += `${index + 1}. ${option.text}\n`
            })

            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: "Não consegui identificar essa opção. Por favor, tente novamente.\n\n" + optionsText,
                },
            ])
        }
    }

    const handleSendMessage = () => {
        if (!input.trim()) return

        // Adicionar mensagem do usuário
        setMessages((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                role: "user",
                content: input,
            },
        ])

        const userInput = input.trim()
        setInput("")

        // Se não há fluxo executado, não processar
        if (!isFlowExecuted || !savedFlow) {
            setTimeout(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        role: "assistant",
                        content: "Por favor, execute um fluxo primeiro para que eu possa funcionar.",
                    },
                ])
            }, 500)
            return
        }

        // Se é a primeira mensagem e não há nó atual, iniciar o fluxo
        if (!currentNodeId && !waitingForUserInput) {
            setTimeout(() => {
                startFlow()
            }, 500)
            return
        }

        // Se estamos aguardando input do usuário (nó de opções)
        if (waitingForUserInput && currentNodeId) {
            const currentNode = savedFlow.nodes.find((node: any) => node.id === currentNodeId)

            if (currentNode && currentNode.type === "options") {
                const options = currentNode.data.options || []
                const optionIndex = Number.parseInt(userInput) - 1

                if (optionIndex >= 0 && optionIndex < options.length) {
                    // Opção válida - continuar para o próximo nó
                    setWaitingForUserInput(false)
                    setTimeout(() => {
                        const nextNode = findNextNode(currentNodeId, optionIndex)
                        if (nextNode) {
                            processNode(nextNode)
                        } else {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: Date.now().toString(),
                                    role: "assistant",
                                    content: "Fim do fluxo. Obrigado!",
                                },
                            ])
                            setCurrentNodeId(null)
                        }
                    }, 500)
                } else {
                    // Opção inválida - repetir as opções
                    setTimeout(() => {
                        repeatOptions()
                    }, 500)
                }
            }
        }
    }

    // Resto do código do componente permanece igual (drag, mouse events, etc.)
    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
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

        const maxX = window.innerWidth - 384
        const maxY = window.innerHeight - 500

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
            document.body.style.userSelect = "none"
        } else {
            document.body.style.userSelect = ""
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove)
            document.removeEventListener("mouseup", handleMouseUp)
            document.body.style.userSelect = ""
        }
    }, [isDragging, dragStart])

    if (!isOpen) return null

    const chatStyle = {
        right: `${24 + position.x}px`,
        bottom: `${24 + position.y}px`,
        cursor: isDragging ? "grabbing" : "grab",
    }

    return (
        <AnimatePresence>
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
                {/* Header do chat - igual ao TarsChat */}
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-3 flex items-center justify-between border-b border-gray-800 drag-handle">
                    <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8 bg-gray-700">
                            <div className="flex items-center justify-center h-full w-full">
                                <BotIcon className="h-5 w-5 text-gray-200" />
                            </div>
                        </Avatar>
                        <div>
                            <h3 className="text-sm font-medium text-gray-200">AURA</h3>
                            <p className="text-xs text-gray-400">Assistente de IA</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1">
                        {isMinimized ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsMinimized(false)}
                                className="h-7 w-7 text-gray-400 hover:text-gray-200"
                            >
                                <FiMaximize2 className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsMinimized(true)}
                                className="h-7 w-7 text-gray-400 hover:text-gray-200"
                            >
                                <FiMinimize2 className="h-4 w-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-gray-400 hover:text-gray-200">
                            <FiX className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Conteúdo do chat */}
                {!isMinimized && (
                    <>
                        {/* Mensagens */}
                        <div className="p-4 h-[360px] overflow-y-auto bg-gray-950">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`mb-4 ${message.role === "user" ? "flex justify-end" : "flex justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[80%] p-3 rounded-lg whitespace-pre-line ${
                                            message.role === "user"
                                                ? "bg-blue-600 text-white"
                                                : "bg-gray-700 text-gray-100 border border-gray-600/30"
                                        }`}
                                    >
                                        <p className="text-sm">{message.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input para enviar mensagens */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleSendMessage()
                            }}
                            className="p-3 border-t border-gray-800 bg-gray-900"
                        >
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Digite sua mensagem..."
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-600"
                                />
                                <Button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="rounded-full w-10 h-10 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 flex items-center justify-center"
                                >
                                    <FiSend className="h-4 w-4 text-white" />
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    )
}

// Componente do Menu de Imagem usando Dialog (igual ao Reset)
const ImageMenu = ({ isOpen, onClose, onChangeBackground, onSaveImage, onResetBackground, theme }: any) => {
    const { currentGradient } = useTheme()
    const isDark = theme === "dark"

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="sm:max-w-[500px]"
                style={{
                    background: isDark
                        ? `linear-gradient(135deg, 
          rgba(0,0,0,0.95) 0%, 
          ${currentGradient.primary}20 25%, 
          ${currentGradient.secondary}15 50%, 
          ${currentGradient.primary}20 75%, 
          rgba(0,0,0,0.95) 100%)`
                        : `linear-gradient(135deg, 
          rgba(255,255,255,0.95) 0%, 
          ${currentGradient.primary}15 25%, 
          ${currentGradient.secondary}10 50%, 
          ${currentGradient.primary}15 75%, 
          rgba(255,255,255,0.95) 100%)`,
                    backdropFilter: "blur(25px)",
                    border: isDark ? `2px solid ${currentGradient.glow}50` : `2px solid ${currentGradient.primary}40`,
                    boxShadow: isDark
                        ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 
               0 0 0 1px ${currentGradient.glow}30, 
               0 0 40px ${currentGradient.glow}40,
               inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 
               0 0 0 1px ${currentGradient.primary}30, 
               0 0 40px ${currentGradient.primary}25,
               inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                }}
            >
                {/* Animated background pattern */}
                <div
                    className="absolute inset-0 opacity-20 rounded-lg"
                    style={{
                        backgroundImage: isDark
                            ? `radial-gradient(circle at 20% 30%, ${currentGradient.primary}60 0%, transparent 40%), 
                 radial-gradient(circle at 80% 70%, ${currentGradient.secondary}60 0%, transparent 40%),
                 radial-gradient(circle at 50% 50%, ${currentGradient.accent}40 0%, transparent 60%)`
                            : `radial-gradient(circle at 20% 30%, ${currentGradient.primary}40 0%, transparent 40%), 
                 radial-gradient(circle at 80% 70%, ${currentGradient.secondary}40 0%, transparent 40%),
                 radial-gradient(circle at 50% 50%, ${currentGradient.accent}30 0%, transparent 60%)`,
                    }}
                />

                <DialogHeader className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div
                            className="p-4 rounded-2xl"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${currentGradient.primary}40, ${currentGradient.secondary}40)`
                                    : `linear-gradient(135deg, ${currentGradient.primary}30, ${currentGradient.secondary}30)`,
                                boxShadow: `0 8px 20px ${currentGradient.glow}50`,
                            }}
                        >
                            <FiImage
                                className="w-8 h-8"
                                style={{
                                    color: isDark ? "#ffffff" : currentGradient.primary,
                                    filter: `drop-shadow(0 0 8px ${currentGradient.glow}80)`,
                                }}
                            />
                        </div>
                        <div>
                            <DialogTitle
                                className="text-xl font-bold mb-1 flex items-center gap-2"
                                style={{
                                    color: isDark ? "#f9fafb" : "#111827",
                                    textShadow: isDark ? `0 0 15px ${currentGradient.glow}60` : `0 0 8px ${currentGradient.primary}40`,
                                }}
                            >
                                <FiImage className="w-6 h-6" style={{ color: currentGradient.glow }} />
                                Opções de Imagem
                            </DialogTitle>
                            <DialogDescription
                                className="text-sm"
                                style={{
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    textShadow: isDark ? `0 0 5px ${currentGradient.glow}30` : "none",
                                }}
                            >
                                Personalize a aparência do seu fluxo de trabalho
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="relative z-10 grid gap-4 py-6">
                    {/* Alterar Background */}
                    <motion.button
                        whileHover={{ scale: 1.02, x: 6 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onChangeBackground}
                        className="w-full flex items-center gap-5 px-6 py-5 text-sm rounded-2xl transition-all duration-300 group"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, ${currentGradient.primary}25, ${currentGradient.secondary}20)`
                                : `linear-gradient(135deg, ${currentGradient.primary}20, ${currentGradient.secondary}15)`,
                            border: isDark ? `2px solid ${currentGradient.glow}40` : `2px solid ${currentGradient.primary}30`,
                            boxShadow: `0 8px 20px ${currentGradient.glow}30`,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, ${currentGradient.primary}35, ${currentGradient.secondary}30)`
                                : `linear-gradient(135deg, ${currentGradient.primary}30, ${currentGradient.secondary}25)`
                            e.currentTarget.style.boxShadow = `0 12px 30px ${currentGradient.glow}40, 0 0 25px ${currentGradient.glow}35`
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, ${currentGradient.primary}25, ${currentGradient.secondary}20)`
                                : `linear-gradient(135deg, ${currentGradient.primary}20, ${currentGradient.secondary}15)`
                            e.currentTarget.style.boxShadow = `0 8px 20px ${currentGradient.glow}30`
                        }}
                    >
                        <div
                            className="p-4 rounded-2xl transition-all duration-300"
                            style={{
                                background: `linear-gradient(135deg, ${currentGradient.primary}50, ${currentGradient.secondary}40)`,
                                boxShadow: `0 6px 15px ${currentGradient.glow}50`,
                            }}
                        >
                            <FiFolder
                                className="w-6 h-6"
                                style={{
                                    color: "#ffffff",
                                    filter: `drop-shadow(0 0 8px ${currentGradient.glow}80)`,
                                }}
                            />
                        </div>
                        <div className="flex-1 text-left">
                            <div
                                className="font-bold text-base mb-1"
                                style={{
                                    color: isDark ? "#f9fafb" : "#111827",
                                    textShadow: isDark ? `0 0 8px ${currentGradient.glow}50` : `0 0 4px ${currentGradient.primary}30`,
                                }}
                            >
                                Alterar Background
                            </div>
                            <div
                                className="text-sm opacity-80"
                                style={{
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    textShadow: isDark ? `0 0 4px ${currentGradient.glow}30` : "none",
                                }}
                            >
                                Escolher nova imagem de fundo para o fluxo
                            </div>
                        </div>
                    </motion.button>

                    {/* Resetar Background */}
                    <motion.button
                        whileHover={{ scale: 1.02, x: 6 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onResetBackground}
                        className="w-full flex items-center gap-5 px-6 py-5 text-sm rounded-2xl transition-all duration-300 group"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, rgba(239, 68, 68, 0.25), ${currentGradient.primary}20)`
                                : `linear-gradient(135deg, rgba(239, 68, 68, 0.20), ${currentGradient.primary}15)`,
                            border: isDark ? `2px solid rgba(239, 68, 68, 0.5)` : `2px solid rgba(239, 68, 68, 0.4)`,
                            boxShadow: `0 8px 20px rgba(239, 68, 68, 0.25)`,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, rgba(239, 68, 68, 0.35), ${currentGradient.primary}30)`
                                : `linear-gradient(135deg, rgba(239, 68, 68, 0.30), ${currentGradient.primary}25)`
                            e.currentTarget.style.boxShadow = `0 12px 30px rgba(239, 68, 68, 0.35), 0 0 25px ${currentGradient.glow}30`
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, rgba(239, 68, 68, 0.25), ${currentGradient.primary}20)`
                                : `linear-gradient(135deg, rgba(239, 68, 68, 0.20), ${currentGradient.primary}15)`
                            e.currentTarget.style.boxShadow = `0 8px 20px rgba(239, 68, 68, 0.25)`
                        }}
                    >
                        <div
                            className="p-4 rounded-2xl transition-all duration-300"
                            style={{
                                background: `linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(220, 38, 38, 0.5))`,
                                boxShadow: `0 6px 15px rgba(239, 68, 68, 0.4)`,
                            }}
                        >
                            <FiTrash2
                                className="w-6 h-6"
                                style={{
                                    color: "#ffffff",
                                    filter: `drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))`,
                                }}
                            />
                        </div>
                        <div className="flex-1 text-left">
                            <div
                                className="font-bold text-base mb-1"
                                style={{
                                    color: isDark ? "#f9fafb" : "#111827",
                                    textShadow: isDark ? `0 0 8px ${currentGradient.glow}50` : `0 0 4px ${currentGradient.primary}30`,
                                }}
                            >
                                Resetar Background
                            </div>
                            <div
                                className="text-sm opacity-80"
                                style={{
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    textShadow: isDark ? `0 0 4px ${currentGradient.glow}30` : "none",
                                }}
                            >
                                Remover imagem de fundo e voltar ao padrão
                            </div>
                        </div>
                    </motion.button>

                    {/* Salvar Imagem */}
                    <motion.button
                        whileHover={{ scale: 1.02, x: 6 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onSaveImage}
                        className="w-full flex items-center gap-5 px-6 py-5 text-sm rounded-2xl transition-all duration-300 group"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, rgba(34, 197, 94, 0.25), ${currentGradient.secondary}20)`
                                : `linear-gradient(135deg, rgba(34, 197, 94, 0.20), ${currentGradient.secondary}15)`,
                            border: isDark ? `2px solid rgba(34, 197, 94, 0.5)` : `2px solid rgba(34, 197, 94, 0.4)`,
                            boxShadow: `0 8px 20px rgba(34, 197, 94, 0.25)`,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, rgba(34, 197, 94, 0.35), ${currentGradient.secondary}30)`
                                : `linear-gradient(135deg, rgba(34, 197, 94, 0.30), ${currentGradient.secondary}25)`
                            e.currentTarget.style.boxShadow = `0 12px 30px rgba(34, 197, 94, 0.35), 0 0 25px ${currentGradient.glow}30`
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDark
                                ? `linear-gradient(135deg, rgba(34, 197, 94, 0.25), ${currentGradient.secondary}20)`
                                : `linear-gradient(135deg, rgba(34, 197, 94, 0.20), ${currentGradient.secondary}15)`
                            e.currentTarget.style.boxShadow = `0 8px 20px rgba(34, 197, 94, 0.25)`
                        }}
                    >
                        <div
                            className="p-4 rounded-2xl transition-all duration-300"
                            style={{
                                background: `linear-gradient(135deg, rgba(34, 197, 94, 0.6), rgba(22, 163, 74, 0.5))`,
                                boxShadow: `0 6px 15px rgba(34, 197, 94, 0.4)`,
                            }}
                        >
                            <FiCamera
                                className="w-6 h-6"
                                style={{
                                    color: "#ffffff",
                                    filter: `drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))`,
                                }}
                            />
                        </div>
                        <div className="flex-1 text-left">
                            <div
                                className="font-bold text-base mb-1"
                                style={{
                                    color: isDark ? "#f9fafb" : "#111827",
                                    textShadow: isDark ? `0 0 8px ${currentGradient.glow}50` : `0 0 4px ${currentGradient.primary}30`,
                                }}
                            >
                                Salvar Imagem
                            </div>
                            <div
                                className="text-sm opacity-80"
                                style={{
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    textShadow: isDark ? `0 0 4px ${currentGradient.glow}30` : "none",
                                }}
                            >
                                Capturar screenshot do fluxo atual
                            </div>
                        </div>
                    </motion.button>
                </div>

                <div
                    className="relative z-10 flex justify-end gap-3 pt-4 border-t"
                    style={{
                        borderColor: isDark ? `${currentGradient.glow}30` : `${currentGradient.primary}20`,
                    }}
                >
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        className="px-6 py-2"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, rgba(75, 85, 99, 0.4), ${currentGradient.primary}20)`
                                : `linear-gradient(135deg, rgba(229, 231, 235, 0.6), ${currentGradient.primary}15)`,
                            color: isDark ? "#d1d5db" : "#6b7280",
                            border: isDark ? `1px solid ${currentGradient.glow}40` : `1px solid ${currentGradient.primary}30`,
                            boxShadow: `0 4px 12px ${currentGradient.glow}20`,
                        }}
                    >
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Flow Header with enhanced visual design
const FlowHeader = ({
                        onZoomIn,
                        onZoomOut,
                        onFitView,
                        onSave,
                        onLoad,
                        onExecute,
                        onSearch,
                        onReset,
                        onDownload,
                        onToggleSidebar,
                        onOpenBot,
                        onOpenColorPanel,
                        startPosition,
                        mousePosition,
                        componentCount,
                        workflowContainerRef,
                    }: any) => {
    const router = useRouter()
    const { theme, toggleTheme, currentGradient } = useTheme()
    const [searchValue, setSearchValue] = useState("")
    const [showResetDialog, setShowResetDialog] = useState(false)
    const [showExecuteDialog, setShowExecuteDialog] = useState(false)
    const [showImageMenu, setShowImageMenu] = useState(false)

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (searchValue.trim() && onSearch) {
            onSearch(searchValue.trim())
        }
    }

    const handleReset = () => {
        setShowResetDialog(true)
    }

    const confirmReset = () => {
        if (onReset) {
            onReset()
        }
        setShowResetDialog(false)
    }

    const handleExecute = () => {
        if (onExecute) {
            onExecute()
            setShowExecuteDialog(true)
        }
    }

    const handleChangeBackground = () => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (file) {
                const reader = new FileReader()
                reader.onload = (e) => {
                    const imageUrl = e.target?.result as string
                    document.documentElement.style.setProperty("--flow-background-image", `url(${imageUrl})`)
                    localStorage.setItem("flow-background-image", imageUrl)
                }
                reader.readAsDataURL(file)
            }
        }
        input.click()
        setShowImageMenu(false)
    }

    const handleResetBackground = () => {
        document.documentElement.style.removeProperty("--flow-background-image")
        localStorage.removeItem("flow-background-image")
        setShowImageMenu(false)
    }

    const handleSaveImage = async () => {
        setShowImageMenu(false)

        const flowElement = workflowContainerRef?.current
        const headerElement = document.querySelector("header")
        const sidebarElement = document.querySelector(".node-library-sidebar")
        const elegantSidebarElement = document.querySelector(".fixed.left-0.top-0")
        const componentsSidebar = document.querySelector('[class*="sidebar"]')

        if (!flowElement) {
            console.error("Elemento do fluxo não encontrado para captura.")
            alert("Erro: Não foi possível encontrar o elemento do fluxo para captura. Tente novamente.")
            return
        }

        // Ocultar todos os elementos da interface
        headerElement?.classList.add("hiding-for-screenshot")
        sidebarElement?.classList.add("hiding-for-screenshot")
        elegantSidebarElement?.classList.add("hiding-for-screenshot")
        componentsSidebar?.classList.add("hiding-for-screenshot")

        // Ocultar todas as sidebars possíveis
        const allSidebars = document.querySelectorAll('[class*="sidebar"], [class*="Sidebar"], .components-panel')
        allSidebars.forEach((sidebar) => {
            sidebar.classList.add("hiding-for-screenshot")
        })

        try {
            await new Promise((resolve) => setTimeout(resolve, 300))

            const canvas = await html2canvas(flowElement, {
                backgroundColor: null,
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: flowElement.scrollWidth,
                height: flowElement.scrollHeight,
                ignoreElements: (element) => {
                    return (
                        element.classList.contains("hiding-for-screenshot") ||
                        element.classList.contains("node-library-sidebar") ||
                        element.classList.contains("components-panel") ||
                        element.closest(".hiding-for-screenshot") !== null ||
                        element.closest(".node-library-sidebar") !== null ||
                        element.closest(".components-panel") !== null ||
                        element.closest('[class*="sidebar"]') !== null ||
                        element.closest('[class*="Sidebar"]') !== null
                    )
                },
            })

            const link = document.createElement("a")
            link.download = `fluxo-aura-${new Date().toISOString().slice(0, 10)}.png`
            link.href = canvas.toDataURL("image/png", 1.0)
            link.click()

            console.log("Imagem salva com sucesso!")
        } catch (error) {
            console.error("Erro ao salvar imagem:", error)
            alert("Ocorreu um erro ao salvar a imagem. Tente novamente.")
        } finally {
            // Restaurar visibilidade de todos os elementos
            headerElement?.classList.remove("hiding-for-screenshot")
            sidebarElement?.classList.remove("hiding-for-screenshot")
            elegantSidebarElement?.classList.remove("hiding-for-screenshot")
            componentsSidebar?.classList.remove("hiding-for-screenshot")

            allSidebars.forEach((sidebar) => {
                sidebar.classList.remove("hiding-for-screenshot")
            })
        }
    }

    const isDark = theme === "dark"

    return (
        <>
            <header
                className="relative overflow-hidden border-b backdrop-blur-xl"
                style={{
                    background: isDark
                        ? `linear-gradient(135deg, 
                #1a1a2e 0%, 
                #16213e 10%, 
                ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 20%,
                #0f172a 30%,
                ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 40%,
                #1e293b 50%,
                ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 60%,
                #0f172a 70%,
                ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 80%,
                #1a1a2e 90%,
                #16213e 100%)`
                        : `linear-gradient(135deg, 
                #f8fafc 0%, 
                #e2e8f0 10%, 
                ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 20%,
                #f1f5f9 30%,
                ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 40%,
                #e2e8f0 50%,
                ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 60%,
                #f1f5f9 70%,
                ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")} 80%,
                #f8fafc 90%,
                #e2e8f0 100%)`,
                    backdropFilter: "blur(20px)",
                    borderBottom: isDark
                        ? `2px solid ${currentGradient.glow}`
                        : `2px solid ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}`,
                    boxShadow: isDark
                        ? `0 8px 32px rgba(0, 0, 0, 0.8), 
               0 0 60px ${currentGradient.glow}60, 
               0 0 120px ${currentGradient.glow}30,
               inset 0 2px 0 rgba(255, 255, 255, 0.1),
               inset 0 -2px 0 ${currentGradient.glow}40`
                        : `0 8px 32px rgba(0, 0, 0, 0.15), 
               0 0 60px ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}40, 
               0 0 120px ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}20,
               inset 0 2px 0 rgba(255, 255, 255, 0.8),
               inset 0 -2px 0 ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}30`,
                }}
            >
                {/* Animated background overlay */}
                <div
                    className="absolute inset-0 opacity-30"
                    style={{
                        background: isDark
                            ? `radial-gradient(circle at 20% 20%, ${currentGradient.glow}40 0%, transparent 50%), 
                 radial-gradient(circle at 80% 80%, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}40 0%, transparent 50%),
                 radial-gradient(circle at 50% 50%, ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}30 0%, transparent 60%)`
                            : `radial-gradient(circle at 20% 20%, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}30 0%, transparent 50%), 
                 radial-gradient(circle at 80% 80%, ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(" 0%, ", "").replace(" 100%)", "")}30 0%, transparent 50%),
                 radial-gradient(circle at 50% 50%, ${currentGradient.glow}20 0%, transparent 60%)`,
                        animation: "pulse 3s ease-in-out infinite alternate",
                    }}
                />

                <div className="relative z-10 flex items-center justify-between p-6">
                    {/* Left Section */}
                    <div className="flex items-center gap-6">
                        {/* Back Button */}
                        <motion.button
                            whileHover={{ scale: 1.05, x: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => router.push("/")}
                            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`
                                    : `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`,
                                color: "#ffffff",
                                border: `1px solid ${currentGradient.glow}`,
                                boxShadow: `0 4px 15px ${currentGradient.glow}50, 0 0 25px ${currentGradient.glow}30`,
                                filter: `drop-shadow(0 0 10px ${currentGradient.glow})`,
                            }}
                        >
                            <FiArrowLeft className="w-5 h-5" />
                        </motion.button>

                        {/* Sidebar Toggle */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onToggleSidebar}
                            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300"
                            title="Mostrar/Ocultar Componentes"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`
                                    : `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`,
                                color: "#ffffff",
                                border: `1px solid ${currentGradient.glow}`,
                                boxShadow: `0 4px 15px ${currentGradient.glow}50, 0 0 25px ${currentGradient.glow}30`,
                                filter: `drop-shadow(0 0 10px ${currentGradient.glow})`,
                            }}
                        >
                            <FiSidebar className="w-5 h-5" />
                        </motion.button>

                        {/* Search and Controls */}
                        <div className="flex items-center gap-4">
                            {/* Enhanced Search */}
                            <form onSubmit={handleSearch} className="relative">
                                <div className="relative group">
                                    <FiSearch
                                        className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors"
                                        style={{
                                            color: currentGradient.glow,
                                            filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                        }}
                                    />
                                    <Input
                                        type="text"
                                        placeholder="Buscar por ID..."
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        className="w-64 h-11 text-sm pl-12 pr-4 rounded-xl border-2 transition-all duration-300"
                                        style={{
                                            background: isDark
                                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), ${currentGradient.primary}30)`
                                                : `linear-gradient(135deg, rgba(255,255,255,0.9), ${currentGradient.primary}20)`,
                                            color: isDark ? "#f9fafb" : "#111827",
                                            border: `2px solid ${currentGradient.glow}`,
                                            backdropFilter: "blur(15px)",
                                            boxShadow: `0 4px 20px ${currentGradient.glow}40, 0 0 30px ${currentGradient.glow}20, inset 0 1px 0 rgba(255,255,255,0.2)`,
                                        }}
                                    />
                                </div>
                            </form>

                            {/* Zoom Controls */}
                            <div
                                className="flex items-center gap-2 p-1 rounded-xl backdrop-blur-sm"
                                style={{
                                    background: isDark
                                        ? `linear-gradient(135deg, ${currentGradient.primary}40, ${currentGradient.secondary}30)`
                                        : `linear-gradient(135deg, ${currentGradient.primary}30, ${currentGradient.secondary}20)`,
                                    border: `1px solid ${currentGradient.glow}`,
                                    boxShadow: `0 4px 15px ${currentGradient.glow}30`,
                                }}
                            >
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onZoomOut}
                                    className="p-2 rounded-lg transition-all duration-200"
                                    title="Diminuir Zoom"
                                    style={{
                                        color: "#ffffff",
                                        filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                    }}
                                >
                                    <FiZoomOut className="w-4 h-4" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onZoomIn}
                                    className="p-2 rounded-lg transition-all duration-200"
                                    title="Aumentar Zoom"
                                    style={{
                                        color: "#ffffff",
                                        filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                    }}
                                >
                                    <FiZoomIn className="w-4 h-4" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onFitView}
                                    className="p-2 rounded-lg transition-all duration-200"
                                    title="Ajustar à Tela"
                                    style={{
                                        color: "#ffffff",
                                        filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                    }}
                                >
                                    <FiMaximize className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </div>

                        {/* Enhanced Status Indicator */}
                        <div className="status-indicator">
                            <FlowStatusIndicator
                                startPosition={startPosition}
                                mousePosition={mousePosition}
                                componentCount={componentCount}
                                theme={theme}
                                currentGradient={currentGradient}
                            />
                        </div>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-3">
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onSave}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Salvar Fluxo"
                                style={{
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                    border: "1px solid #16a34a",
                                    boxShadow:
                                        "0 4px 15px rgba(34, 197, 94, 0.4), 0 0 25px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiSave className="w-4 h-4" />
                                Salvar
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleReset}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Resetar Fluxo"
                                style={{
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                    border: "1px solid #dc2626",
                                    boxShadow:
                                        "0 4px 15px rgba(239, 68, 68, 0.4), 0 0 25px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiRefreshCw className="w-4 h-4" />
                                Resetar
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onDownload}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Download do Fluxo"
                                style={{
                                    background: "linear-gradient(135deg, #a855f7, #9333ea)",
                                    border: "1px solid #9333ea",
                                    boxShadow:
                                        "0 4px 15px rgba(168, 85, 247, 0.4), 0 0 25px rgba(168, 85, 247, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiDownload className="w-4 h-4" />
                                Download
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onLoad}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Carregar Fluxo"
                                style={{
                                    background: "linear-gradient(135deg, #6b7280, #4b5563)",
                                    border: "1px solid #4b5563",
                                    boxShadow:
                                        "0 4px 15px rgba(107, 114, 128, 0.4), 0 0 25px rgba(107, 114, 128, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiDownload className="w-4 h-4" />
                                Carregar
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleExecute}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Executar Fluxo"
                                style={{
                                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                    border: "1px solid #2563eb",
                                    boxShadow:
                                        "0 4px 15px rgba(59, 130, 246, 0.4), 0 0 25px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiPlayCircle className="w-4 h-4" />
                                Executar
                            </motion.button>
                        </div>

                        {/* Divider */}
                        <div
                            className="w-px h-8 opacity-60"
                            style={{
                                background: currentGradient.glow,
                                boxShadow: `0 0 10px ${currentGradient.glow}`,
                            }}
                        />

                        {/* Utility Buttons */}
                        <div className="flex items-center gap-2">
                            <motion.button
                                whileHover={{ scale: 1.1, rotate: 180 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={toggleTheme}
                                className="p-3 rounded-xl transition-all duration-300 text-white"
                                title={isDark ? "Modo Claro" : "Modo Escuro"}
                                style={{
                                    background: isDark
                                        ? "linear-gradient(135deg, #f59e0b, #d97706)"
                                        : "linear-gradient(135deg, #6366f1, #4f46e5)",
                                    border: isDark ? "1px solid #d97706" : "1px solid #4f46e5",
                                    boxShadow: isDark
                                        ? "0 4px 15px rgba(245, 158, 11, 0.4), 0 0 25px rgba(245, 158, 11, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
                                        : "0 4px 15px rgba(99, 102, 241, 0.4), 0 0 25px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                {isDark ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setShowImageMenu(!showImageMenu)}
                                className="p-3 rounded-xl transition-all duration-300 text-white"
                                title="Opções de Imagem"
                                style={{
                                    background: "linear-gradient(135deg, #ec4899, #db2777)",
                                    border: "1px solid #db2777",
                                    boxShadow:
                                        "0 4px 15px rgba(236, 72, 153, 0.4), 0 0 25px rgba(236, 72, 153, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiImage className="w-5 h-5" />
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={onOpenColorPanel}
                                className="p-3 rounded-xl transition-all duration-300 text-white"
                                title="Abrir Painel de Cores"
                                style={{
                                    background: "linear-gradient(135deg, #10b981, #059669)",
                                    border: "1px solid #059669",
                                    boxShadow:
                                        "0 4px 15px rgba(16, 185, 129, 0.4), 0 0 25px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <FiSettings className="w-5 h-5" />
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onOpenBot}
                                className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 flex items-center gap-2 text-white"
                                title="Abrir ChatBot"
                                style={{
                                    background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                                    border: "1px solid #0891b2",
                                    boxShadow:
                                        "0 4px 15px rgba(6, 182, 212, 0.4), 0 0 25px rgba(6, 182, 212, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                <BotIcon className="w-4 h-4" />
                                Aura Bot
                            </motion.button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Image Menu Dialog */}
            <ImageMenu
                isOpen={showImageMenu}
                onClose={() => setShowImageMenu(false)}
                onChangeBackground={handleChangeBackground}
                onSaveImage={handleSaveImage}
                onResetBackground={handleResetBackground}
                theme={theme}
            />

            {/* Reset Dialog with Theme Colors */}
            <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <DialogContent
                    className="sm:max-w-[425px]"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, 
                  rgba(0,0,0,0.95) 0%, 
                  ${currentGradient.primary}20 25%, 
                  ${currentGradient.secondary}15 50%, 
                  ${currentGradient.primary}20 75%, 
                  rgba(0,0,0,0.95) 100%)`
                            : `linear-gradient(135deg, 
                  rgba(255,255,255,0.95) 0%, 
                  ${currentGradient.primary}15 25%, 
                  ${currentGradient.secondary}10 50%, 
                  ${currentGradient.primary}15 75%, 
                  rgba(255,255,255,0.95) 100%)`,
                        backdropFilter: "blur(25px)",
                        border: isDark ? `2px solid ${currentGradient.glow}50` : `2px solid ${currentGradient.primary}40`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 
                 0 0 0 1px ${currentGradient.glow}30, 
                 0 0 40px ${currentGradient.glow}40,
                 inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 
                 0 0 0 1px ${currentGradient.primary}30, 
                 0 0 40px ${currentGradient.primary}25,
                 inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                    }}
                >
                    {/* Animated background pattern */}
                    <div
                        className="absolute inset-0 opacity-20 rounded-lg"
                        style={{
                            backgroundImage: isDark
                                ? `radial-gradient(circle at 20% 30%, ${currentGradient.primary}60 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}60 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}40 0%, transparent 60%)`
                                : `radial-gradient(circle at 20% 30%, ${currentGradient.primary}40 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}40 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}30 0%, transparent 60%)`,
                        }}
                    />

                    <DialogHeader className="relative z-10">
                        <DialogTitle
                            className="text-lg font-bold flex items-center gap-2"
                            style={{
                                color: isDark ? "#f9fafb" : "#111827",
                                textShadow: isDark ? `0 0 15px ${currentGradient.glow}60` : `0 0 8px ${currentGradient.primary}40`,
                            }}
                        >
                            <FiRefreshCw className="w-5 h-5 text-red-500" />
                            Confirmar Reset
                        </DialogTitle>
                        <DialogDescription
                            className="text-sm"
                            style={{
                                color: isDark ? "#d1d5db" : "#6b7280",
                                textShadow: isDark ? `0 0 5px ${currentGradient.glow}30` : "none",
                            }}
                        >
                            Tem certeza de que deseja resetar o fluxo? Todas as alterações não salvas serão perdidas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative z-10 grid gap-4 py-4">
                        <p
                            className="text-sm font-medium flex items-center gap-2"
                            style={{
                                color: isDark ? "#fca5a5" : "#dc2626",
                                textShadow: isDark ? `0 0 8px rgba(239, 68, 68, 0.6)` : "none",
                            }}
                        >
                            <FiX className="w-4 h-4" />
                            Esta ação é irreversível e não pode ser desfeita.
                        </p>
                    </div>
                    <div className="relative z-10 flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setShowResetDialog(false)}
                            className="px-6 py-2"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, rgba(75, 85, 99, 0.4), ${currentGradient.primary}20)`
                                    : `linear-gradient(135deg, rgba(229, 231, 235, 0.6), ${currentGradient.primary}15)`,
                                color: isDark ? "#d1d5db" : "#6b7280",
                                border: isDark ? `1px solid ${currentGradient.glow}40` : `1px solid ${currentGradient.primary}30`,
                                boxShadow: `0 4px 12px ${currentGradient.glow}20`,
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmReset}
                            className="px-6 py-2 flex items-center gap-2"
                            style={{
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                border: "1px solid #dc2626",
                                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
                                color: "#ffffff",
                            }}
                        >
                            <FiTrash2 className="w-4 h-4" />
                            Resetar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Execute Dialog with Theme Colors */}
            <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
                <DialogContent
                    className="sm:max-w-[425px]"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, 
                  rgba(0,0,0,0.95) 0%, 
                  ${currentGradient.primary}20 25%, 
                  ${currentGradient.secondary}15 50%, 
                  ${currentGradient.primary}20 75%, 
                  rgba(0,0,0,0.95) 100%)`
                            : `linear-gradient(135deg, 
                  rgba(255,255,255,0.95) 0%, 
                  ${currentGradient.primary}15 25%, 
                  ${currentGradient.secondary}10 50%, 
                  ${currentGradient.primary}15 75%, 
                  rgba(255,255,255,0.95) 100%)`,
                        backdropFilter: "blur(25px)",
                        border: isDark ? `2px solid ${currentGradient.glow}50` : `2px solid ${currentGradient.primary}40`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 
                 0 0 0 1px ${currentGradient.glow}30, 
                 0 0 40px ${currentGradient.glow}40,
                 inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 
                 0 0 0 1px ${currentGradient.primary}30, 
                 0 0 40px ${currentGradient.primary}25,
                 inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                    }}
                >
                    {/* Animated background pattern */}
                    <div
                        className="absolute inset-0 opacity-20 rounded-lg"
                        style={{
                            backgroundImage: isDark
                                ? `radial-gradient(circle at 20% 30%, ${currentGradient.primary}60 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}60 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}40 0%, transparent 60%)`
                                : `radial-gradient(circle at 20% 30%, ${currentGradient.primary}40 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}40 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}30 0%, transparent 60%)`,
                        }}
                    />

                    <DialogHeader className="relative z-10">
                        <DialogTitle
                            className="text-lg font-bold flex items-center gap-2"
                            style={{
                                color: isDark ? "#f9fafb" : "#111827",
                                textShadow: isDark ? `0 0 15px ${currentGradient.glow}60` : `0 0 8px ${currentGradient.primary}40`,
                            }}
                        >
                            <FiPlayCircle className="w-5 h-5 text-green-500" />
                            Fluxo em Execução
                        </DialogTitle>
                        <DialogDescription
                            className="text-sm"
                            style={{
                                color: isDark ? "#d1d5db" : "#6b7280",
                                textShadow: isDark ? `0 0 5px ${currentGradient.glow}30` : "none",
                            }}
                        >
                            O fluxo está sendo executado com sucesso. Você pode interagir com o bot para testar o fluxo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative z-10 grid gap-4 py-4">
                        <p
                            className="text-sm font-medium flex items-center gap-2"
                            style={{
                                color: isDark ? "#86efac" : "#16a34a",
                                textShadow: isDark ? `0 0 8px rgba(34, 197, 94, 0.6)` : "none",
                            }}
                        >
                            <FiCheckCircle className="w-4 h-4" />
                            Abra o Aura Bot para interagir com o fluxo executado.
                        </p>
                    </div>
                    <div className="relative z-10 flex justify-end">
                        <Button
                            type="button"
                            onClick={() => setShowExecuteDialog(false)}
                            className="px-6 py-2"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${currentGradient.primary}60, ${currentGradient.secondary}60)`
                                    : `linear-gradient(135deg, ${currentGradient.primary}50, ${currentGradient.secondary}50)`,
                                color: "white",
                                border: isDark ? `1px solid ${currentGradient.glow}50` : `1px solid ${currentGradient.primary}50`,
                                boxShadow: `0 4px 12px ${currentGradient.glow}40`,
                            }}
                        >
                            Entendi
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

// Component principal
const FlowLayout = () => {
    const { theme, showColorPanel, showSearch, currentGradient, setShowColorPanel } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [workflowActions, setWorkflowActions] = useState<any>(null)
    const [startPosition, setStartPosition] = useState({ x: 250, y: 100 })
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
    const [componentCount, setComponentCount] = useState(1)
    const [showSidebar, setShowSidebar] = useState(true)
    const [showBot, setShowBot] = useState(false)
    const [flowNodes, setFlowNodes] = useState<any[]>([])
    const [flowEdges, setFlowEdges] = useState<any[]>([])
    const workflowContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setMounted(true)
        // Carregar imagem de fundo do localStorage ao montar
        const savedImage = localStorage.getItem("flow-background-image")
        if (savedImage) {
            document.documentElement.style.setProperty("--flow-background-image", `url(${savedImage})`)
        }
    }, [])

    const toggleSidebar = useCallback(() => {
        setShowSidebar(!showSidebar)
    }, [showSidebar])

    const openBot = useCallback(() => {
        setShowBot(true)
    }, [])

    const closeBot = useCallback(() => {
        setShowBot(false)
    }, [])

    // Função para receber as ações do WorkflowBuilder
    const handleActionsReady = useCallback((actions: any) => {
        setWorkflowActions(actions)
    }, [])

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="text-lg">Carregando Construtor de Fluxo...</div>
            </div>
        )
    }

    return (
        <div className={`flex flex-col h-screen flow-background ${theme === "dark" ? "bg-black" : "bg-gray-50"}`}>
            <FlowElegantSidebar currentGradient={currentGradient} theme={theme} />

            <FlowHeader
                onZoomIn={workflowActions?.zoomIn}
                onZoomOut={workflowActions?.zoomOut}
                onFitView={workflowActions?.fitView}
                onSave={workflowActions?.save}
                onLoad={workflowActions?.load}
                onExecute={workflowActions?.execute}
                onSearch={workflowActions?.search}
                onReset={workflowActions?.reset}
                onDownload={workflowActions?.download}
                onToggleSidebar={toggleSidebar}
                onOpenBot={openBot}
                onOpenColorPanel={setShowColorPanel}
                startPosition={startPosition}
                mousePosition={mousePosition}
                componentCount={componentCount}
                workflowContainerRef={workflowContainerRef}
            />

            <main className="flex-1 overflow-hidden" ref={workflowContainerRef}>
                <WorkflowBuilder
                    onActionsReady={handleActionsReady}
                    onStartPositionChange={setStartPosition}
                    onMousePositionChange={setMousePosition}
                    onComponentCountChange={setComponentCount}
                    onNodesChange={setFlowNodes}
                    onEdgesChange={setFlowEdges}
                    showSidebar={showSidebar}
                    onToggleSidebar={toggleSidebar}
                    onOpenBot={openBot}
                />
            </main>

            {/* Bot Aura que executa o fluxo salvo */}
            <AuraFlowBot isOpen={showBot} onClose={closeBot} />

            {showColorPanel && <ColorPanel />}
        </div>
    )
}

const Flow = () => {
    return (
        <ThemeProvider>
            <FlowLayout />
        </ThemeProvider>
    )
}

export default Flow
