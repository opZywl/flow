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
const FlowStatusIndicator = ({ startPosition, mousePosition, componentCount, theme }: any) => {
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
            className={`flex items-center gap-4 px-3 py-1.5 rounded-lg border text-xs transition-all duration-200 ${
                isDark
                    ? "bg-black hover:bg-gray-900 border border-gray-800 hover:border-gray-700 text-white"
                    : "bg-gray-50 hover:bg-white border border-gray-200 hover:border-gray-300 text-gray-900"
            }`}
            style={{
                boxShadow: isDark
                    ? "0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 10px rgba(255, 255, 255, 0.1)"
                    : "0 0 0 1px rgba(0, 0, 0, 0.05), 0 0 8px rgba(0, 0, 0, 0.05)",
                filter: isDark ? "drop-shadow(0 0 5px rgba(255, 255, 255, 0.1))" : "drop-shadow(0 0 3px rgba(0, 0, 0, 0.1))",
            }}
        >
            {/* Status de Execução */}
            <div className="flex items-center gap-1">
                {isExecuted ? (
                    <FiCheckCircle
                        className="h-3 w-3 text-green-500"
                        style={{
                            filter: isDark
                                ? "drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))"
                                : "drop-shadow(0 0 2px rgba(34, 197, 94, 0.3))",
                        }}
                    />
                ) : (
                    <FiXCircle
                        className="h-3 w-3 text-red-500"
                        style={{
                            filter: isDark
                                ? "drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))"
                                : "drop-shadow(0 0 2px rgba(239, 68, 68, 0.3))",
                        }}
                    />
                )}
                <span
                    className={`font-semibold ${
                        isDark
                            ? "text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.3)]"
                            : "text-gray-900 drop-shadow-[0_0_2px_rgba(0,0,0,0.2)]"
                    }`}
                >
          {isExecuted ? "EXECUTADO" : "NÃO EXECUTADO"}
        </span>
            </div>

            {/* Separador */}
            <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

            {/* Posição do INÍCIO */}
            <div className="flex items-center gap-1">
                <FiMapPin
                    className="h-3 w-3 text-blue-500"
                    style={{
                        filter: isDark
                            ? "drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))"
                            : "drop-shadow(0 0 2px rgba(59, 130, 246, 0.3))",
                    }}
                />
                <span
                    className={`font-mono ${
                        isDark
                            ? "text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.3)]"
                            : "text-gray-900 drop-shadow-[0_0_2px_rgba(0,0,0,0.2)]"
                    }`}
                >
          INÍCIO: ({Math.round(startPosition.x)}, {Math.round(startPosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

            {/* Posição do Mouse */}
            <div className="flex items-center gap-1">
                <span className="text-purple-500">🖱️</span>
                <span className={`font-mono ${isDark ? "text-white" : "text-gray-900"}`}>
          Mouse: ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

            {/* Contador de Componentes */}
            <div className="flex items-center gap-1">
                <FiLayers className="h-3 w-3 text-orange-500" />
                <span className={isDark ? "text-white" : "text-gray-900"}>
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

// Componente do Menu de Imagem SUPER BONITO! ✨
const ImageMenu = ({ isOpen, onClose, onChangeBackground, onSaveImage, theme }: any) => {
    const isDark = theme === "dark"

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={`absolute right-4 top-16 w-56 rounded-xl border shadow-2xl backdrop-blur-sm ${
                        isDark ? "bg-gray-900/95 border-gray-700/50" : "bg-white/95 border-gray-200/50"
                    }`}
                    style={{
                        boxShadow: isDark
                            ? "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)"
                            : "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header do menu */}
                    <div className={`px-4 py-3 border-b ${isDark ? "border-gray-700/50" : "border-gray-200/50"}`}>
                        <h3 className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                            🎨 Opções de Imagem
                        </h3>
                    </div>

                    {/* Opções do menu */}
                    <div className="p-2">
                        <motion.button
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onChangeBackground}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-all duration-200 group ${
                                isDark
                                    ? "hover:bg-gradient-to-r hover:from-blue-900/30 hover:to-purple-900/30 text-gray-200 hover:text-white"
                                    : "hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 text-gray-700 hover:text-gray-900"
                            }`}
                            style={{
                                boxShadow: isDark ? "0 0 0 1px rgba(255, 255, 255, 0.05)" : "0 0 0 1px rgba(0, 0, 0, 0.05)",
                            }}
                        >
                            <div
                                className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDark ? "bg-blue-500/20 group-hover:bg-blue-500/30" : "bg-blue-100 group-hover:bg-blue-200"
                                }`}
                            >
                                <FiFolder className={`h-4 w-4 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-medium">Alterar Background</div>
                                <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    Escolher nova imagem de fundo
                                </div>
                            </div>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onSaveImage}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-all duration-200 group mt-1 ${
                                isDark
                                    ? "hover:bg-gradient-to-r hover:from-green-900/30 hover:to-emerald-900/30 text-gray-200 hover:text-white"
                                    : "hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 text-gray-700 hover:text-gray-900"
                            }`}
                            style={{
                                boxShadow: isDark ? "0 0 0 1px rgba(255, 255, 255, 0.05)" : "0 0 0 1px rgba(0, 0, 0, 0.05)",
                            }}
                        >
                            <div
                                className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDark ? "bg-green-500/20 group-hover:bg-green-500/30" : "bg-green-100 group-hover:bg-green-200"
                                }`}
                            >
                                <FiCamera className={`h-4 w-4 ${isDark ? "text-green-400" : "text-green-600"}`} />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-medium">Salvar Imagem</div>
                                <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    Capturar screenshot do fluxo
                                </div>
                            </div>
                        </motion.button>
                    </div>

                    {/* Footer do menu */}
                    <div className={`px-4 py-2 border-t ${isDark ? "border-gray-700/50" : "border-gray-200/50"}`}>
                        <p className={`text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                            ✨ Clique fora para fechar
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// Flow Header
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
                        workflowContainerRef, // Recebe a ref para o container do workflow
                    }: any) => {
    const router = useRouter()
    const { theme, toggleTheme } = useTheme()
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
                    // Aplica a imagem de fundo via CSS variable
                    document.documentElement.style.setProperty("--flow-background-image", `url(${imageUrl})`)
                    // Salva no localStorage para persistência
                    localStorage.setItem("flow-background-image", imageUrl)
                }
                reader.readAsDataURL(file)
            }
        }
        input.click()
        setShowImageMenu(false)
    }

    const handleSaveImage = async () => {
        setShowImageMenu(false)
        const flowElement = workflowContainerRef.current
        const headerElement = document.querySelector("header")
        const sidebarElement = document.querySelector(".node-library-sidebar") // Adicione uma classe à sua sidebar

        if (!flowElement) {
            console.error("Elemento do fluxo não encontrado para captura.")
            return
        }

        // Adiciona classes para esconder a UI
        headerElement?.classList.add("hiding-for-screenshot")
        sidebarElement?.classList.add("hiding-for-screenshot")

        try {
            // Pequeno delay para garantir que a UI foi escondida
            await new Promise((resolve) => setTimeout(resolve, 100))

            const canvas = await html2canvas(flowElement, {
                backgroundColor: null, // Fundo transparente para usar o do CSS
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: flowElement.scrollWidth,
                height: flowElement.scrollHeight,
            })

            const link = document.createElement("a")
            link.download = `fluxo-aura-${new Date().toISOString().slice(0, 10)}.png`
            link.href = canvas.toDataURL("image/png", 1.0)
            link.click()
        } catch (error) {
            console.error("Erro ao salvar imagem:", error)
            alert("Ocorreu um erro ao salvar a imagem. Tente novamente.")
        } finally {
            // Remove as classes para mostrar a UI novamente
            headerElement?.classList.remove("hiding-for-screenshot")
            sidebarElement?.classList.remove("hiding-for-screenshot")
        }
    }

    const isDark = theme === "dark"

    const getButtonStyle = () => ({
        filter: isDark ? `drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))` : `drop-shadow(0 0 2px rgba(0, 0, 0, 0.1))`,
    })

    return (
        <>
            <header
                className={`flex items-center justify-between p-4 border-b ${
                    isDark ? "bg-black border-gray-800" : "bg-white border-gray-200"
                }`}
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/")}
                        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                            isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                        }`}
                        style={getButtonStyle()}
                    >
                        <FiArrowLeft />
                    </button>

                    <button
                        onClick={onToggleSidebar}
                        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                            isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                        }`}
                        title="Mostrar/Ocultar Componentes"
                        style={getButtonStyle()}
                    >
                        <FiSidebar />
                    </button>

                    <div className="flex items-center gap-2">
                        <form onSubmit={handleSearch} className="relative">
                            <div className="relative">
                                <FiSearch
                                    className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${
                                        isDark ? "text-gray-400" : "text-gray-500"
                                    }`}
                                />
                                <Input
                                    type="text"
                                    placeholder="Buscar por ID..."
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    className={`w-48 h-8 text-sm pl-10 ${
                                        isDark
                                            ? "bg-black border-gray-700 text-white placeholder-gray-400 hover:bg-gray-900"
                                            : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:bg-gray-50"
                                    }`}
                                />
                            </div>
                        </form>

                        <button
                            onClick={onZoomOut}
                            className={`p-2 rounded-md transition-colors ${
                                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                            }`}
                            title="Diminuir Zoom"
                            style={getButtonStyle()}
                        >
                            <FiZoomOut />
                        </button>
                        <button
                            onClick={onZoomIn}
                            className={`p-2 rounded-md transition-colors ${
                                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                            }`}
                            title="Aumentar Zoom"
                            style={getButtonStyle()}
                        >
                            <FiZoomIn />
                        </button>
                        <button
                            onClick={onFitView}
                            className={`p-2 rounded-md transition-colors ${
                                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                            }`}
                            title="Ajustar à Tela"
                            style={getButtonStyle()}
                        >
                            <FiMaximize />
                        </button>
                    </div>

                    <FlowStatusIndicator
                        startPosition={startPosition}
                        mousePosition={mousePosition}
                        componentCount={componentCount}
                        theme={theme}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onSave}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-gray-800 text-gray-300 border border-gray-700"
                                : "hover:bg-gray-50 text-gray-700 border border-gray-300"
                        }`}
                        title="Salvar Fluxo"
                        style={getButtonStyle()}
                    >
                        <FiSave className="inline mr-1" />
                        Salvar
                    </button>

                    <button
                        onClick={handleReset}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-red-900 text-red-300 border border-red-700"
                                : "hover:bg-red-50 text-red-700 border border-red-300"
                        }`}
                        title="Resetar Fluxo"
                    >
                        <FiRefreshCw className="inline mr-1" />
                        Resetar
                    </button>

                    <button
                        onClick={onDownload}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-green-900 text-green-300 border border-green-700"
                                : "hover:bg-green-50 text-green-700 border border-green-300"
                        }`}
                        title="Download do Fluxo"
                    >
                        <FiDownload className="inline mr-1" />
                        Download
                    </button>

                    <button
                        onClick={onLoad}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-gray-800 text-gray-300 border border-gray-700"
                                : "hover:bg-gray-50 text-gray-700 border border-gray-300"
                        }`}
                        title="Carregar Fluxo"
                        style={getButtonStyle()}
                    >
                        <FiDownload className="inline mr-1" />
                        Carregar
                    </button>

                    <button
                        onClick={handleExecute}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-blue-900 text-blue-300 border border-blue-700"
                                : "hover:bg-blue-50 text-blue-700 border border-blue-300"
                        }`}
                        title="Executar Fluxo"
                        style={{
                            filter: isDark
                                ? "drop-shadow(0 0 4px rgba(59, 130, 246, 0.3))"
                                : "drop-shadow(0 0 2px rgba(59, 130, 246, 0.2))",
                        }}
                    >
                        <FiPlayCircle className="inline mr-1" />
                        Executar
                    </button>

                    <div className={`w-px h-6 mx-2 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

                    <button
                        onClick={toggleTheme}
                        className={`p-2 rounded-md transition-colors ${
                            isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                        }`}
                        title={isDark ? "Modo Claro" : "Modo Escuro"}
                        style={getButtonStyle()}
                    >
                        {isDark ? <FiSun /> : <FiMoon />}
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowImageMenu(!showImageMenu)}
                            className={`p-2 rounded-md transition-colors ${
                                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                            }`}
                            title="Opções de Imagem"
                            style={getButtonStyle()}
                        >
                            <FiImage />
                        </button>

                        <ImageMenu
                            isOpen={showImageMenu}
                            onClose={() => setShowImageMenu(false)}
                            onChangeBackground={handleChangeBackground}
                            onSaveImage={handleSaveImage}
                            theme={theme}
                        />
                    </div>

                    <button
                        onClick={onOpenColorPanel}
                        className={`p-2 rounded-md transition-colors ${
                            isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                        }`}
                        title="Abrir Painel de Cores"
                        style={getButtonStyle()}
                    >
                        <FiSettings />
                    </button>

                    <button
                        onClick={onOpenBot}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isDark
                                ? "hover:bg-gray-800 text-gray-300 border border-gray-700"
                                : "hover:bg-gray-50 text-gray-700 border border-gray-300"
                        }`}
                        title="Abrir ChatBot"
                        style={getButtonStyle()}
                    >
                        <BotIcon className="inline mr-1 h-4 w-4" />
                        Aura Bot
                    </button>
                </div>
            </header>

            {/* Reset Confirmation Dialog */}
            <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Confirmar Reset</DialogTitle>
                        <DialogDescription>
                            Tem certeza de que deseja resetar o fluxo? Todas as alterações não salvas serão perdidas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <p>Esta ação é irreversível.</p>
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" variant="secondary" onClick={() => setShowResetDialog(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" variant="destructive" onClick={confirmReset}>
                            Resetar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Execute Confirmation Dialog */}
            <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Fluxo em Execução</DialogTitle>
                        <DialogDescription>
                            O fluxo está sendo executado. Você pode interagir com o bot para testar o fluxo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <p>Abra o bot para interagir com o fluxo.</p>
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" onClick={() => setShowExecuteDialog(false)}>
                            Fechar
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
    const workflowContainerRef = useRef<HTMLDivElement>(null) // Ref para o container do workflow

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
                workflowContainerRef={workflowContainerRef} // Passa a ref para o header
            />

            <main className="flex-1 overflow-hidden">
                <WorkflowBuilder
                    ref={workflowContainerRef} // Atribui a ref ao WorkflowBuilder
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
