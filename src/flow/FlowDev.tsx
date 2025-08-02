"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { ThemeProvider, useTheme } from "../ThemeContext"
import ColorPanel from "../ColorPanel"
import WorkflowBuilder from "./workflow-builder"
import { useRouter } from "next/navigation"
import {
    ArrowLeft,
    Search,
    Save,
    PlayCircle,
    Download,
    Sun,
    Moon,
    ZoomIn,
    ZoomOut,
    Maximize,
    RefreshCw,
    MapPin,
    Layers,
    PanelLeft,
    X,
    Minimize2,
    Maximize2,
    Send,
    CheckCircle,
    XCircle,
    ImageIcon,
    Settings,
    Camera,
    Folder,
    Trash2,
    Upload,
    MousePointer,
    BotIcon,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { motion, AnimatePresence } from "framer-motion"
import html2canvas from "html2canvas"

// Componente da barra lateral elegante para o flow
const FlowElegantSidebar = ({ currentGradient, theme }: { currentGradient: any; theme: string }) => {
    const glowColor = currentGradient?.glow || "#000000"
    const primaryColor = currentGradient?.primary || "#000000"
    const secondaryColor = currentGradient?.secondary || "#000000"

    return (
        <div className="fixed left-0 top-0 h-full z-50 flex items-center pointer-events-none">
            <div
                className="h-[80%] w-[3px] rounded-full relative overflow-hidden panel-glow"
                style={{
                    background: `linear-gradient(to bottom, ${glowColor}, transparent, ${glowColor})`,
                }}
            >
                {/* Pontos decorativos */}
                <div
                    className="absolute top-[20%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? glowColor : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${glowColor}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />
                <div
                    className="absolute top-[50%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? glowColor : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${glowColor}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />
                <div
                    className="absolute top-[80%] left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full panel-glow"
                    style={{
                        background: theme === "dark" ? glowColor : "#374151",
                        boxShadow: theme === "dark" ? `0 0 8px ${glowColor}` : "0 0 4px rgba(0,0,0,0.3)",
                    }}
                />

                {/* Efeito de brilho */}
                <div
                    className="absolute top-0 left-0 w-full h-full"
                    style={{
                        background:
                            theme === "dark"
                                ? `linear-gradient(to bottom, ${primaryColor}, transparent, ${secondaryColor})`
                                : `linear-gradient(to bottom, #6B7280, transparent, #6B7280)`,
                        opacity: theme === "dark" ? 0.2 : 0.1,
                    }}
                />
            </div>
        </div>
    )
}

// Componente do Indicador de Status com todas as informações
const FlowStatusIndicator = ({ startPosition, mousePosition, componentCount, theme, currentGradient }: any) => {
    const isDark = theme === "dark"
    const [isExecuted, setIsExecuted] = useState(false)
    const glowColor = currentGradient?.glow || "#000000"

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
        const interval = setInterval(handleStorageChange, 1000)

        return () => {
            window.removeEventListener("storage", handleStorageChange)
            clearInterval(interval)
        }
    }, [])

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center space-x-4 px-4 py-2 rounded-xl text-xs"
            style={{
                background: isDark
                    ? `linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04))`
                    : `linear-gradient(135deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.02))`,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.08)",
                color: isDark ? "#e4e4e7" : "#52525b",
                fontFamily: "system-ui, -apple-system, sans-serif",
            }}
        >
            {/* Status de Execução */}
            <div className="flex items-center space-x-2">
                <motion.div
                    animate={{
                        scale: isExecuted ? [1, 1.1, 1] : 1,
                    }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                >
                    {isExecuted ? (
                        <CheckCircle
                            className="h-3.5 w-3.5 text-emerald-500"
                            style={{
                                filter: `drop-shadow(0 0 4px rgba(16, 185, 129, 0.6))`,
                            }}
                        />
                    ) : (
                        <XCircle
                            className="h-3.5 w-3.5 text-rose-500"
                            style={{
                                filter: `drop-shadow(0 0 4px rgba(244, 63, 94, 0.6))`,
                            }}
                        />
                    )}
                </motion.div>
                <span className="font-medium">{isExecuted ? "Active" : "Inactive"}</span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            {/* Posição do INÍCIO */}
            <div className="flex items-center space-x-2">
                <MapPin
                    className="h-3.5 w-3.5"
                    style={{
                        color: glowColor,
                        filter: `drop-shadow(0 0 4px ${glowColor}60)`,
                    }}
                />
                <span className="font-mono text-xs">
          START ({Math.round(startPosition.x)}, {Math.round(startPosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            {/* Posição do Mouse */}
            <div className="flex items-center space-x-2">
                <MousePointer
                    className="h-3.5 w-3.5"
                    style={{
                        color: glowColor,
                        filter: `drop-shadow(0 0 4px ${glowColor}60)`,
                    }}
                />
                <span className="font-mono text-xs">
          CURSOR ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
        </span>
            </div>

            {/* Separador */}
            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            {/* Contador de Componentes */}
            <div className="flex items-center space-x-2">
                <Layers
                    className="h-3.5 w-3.5"
                    style={{
                        color: glowColor,
                        filter: `drop-shadow(0 0 4px ${glowColor}60)`,
                    }}
                />
                <span className="font-medium">{componentCount} nodes</span>
            </div>
        </motion.div>
    )
}

const YenFlowBot = ({
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

    const { theme, currentGradient } = useTheme()
    const primaryColor = currentGradient?.primary || "#000000"
    const secondaryColor = currentGradient?.secondary || "#000000"
    const accentColor = currentGradient?.accent || "#000000"
    const glowColor = currentGradient?.glow || "#000000"

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
            const nodeEdges = edges.filter((edge: any) => edge.source === currentNodeId)
            targetEdge = nodeEdges[optionIndex]
        } else {
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

        const startNode = savedFlow.nodes.find((node: any) => node.id === "start-node")
        if (startNode) {
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

        if (!currentNodeId && !waitingForUserInput) {
            setTimeout(() => {
                startFlow()
            }, 500)
            return
        }

        if (waitingForUserInput && currentNodeId) {
            const currentNode = savedFlow.nodes.find((node: any) => node.id === currentNodeId)

            if (currentNode && currentNode.type === "options") {
                const options = currentNode.data.options || []
                const optionIndex = Number.parseInt(userInput) - 1

                if (optionIndex >= 0 && optionIndex < options.length) {
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
                    setTimeout(() => {
                        repeatOptions()
                    }, 500)
                }
            }
        }
    }

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

    const isDark = theme === "dark"

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
                className="fixed w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden z-50"
                style={{
                    ...chatStyle,
                    background: isDark
                        ? `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, ${primaryColor}15 50%, rgba(0,0,0,0.95) 100%)`
                        : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${primaryColor}10 50%, rgba(255,255,255,0.95) 100%)`,
                    backdropFilter: "blur(20px)",
                    border: isDark ? `1px solid ${glowColor}40` : `1px solid ${primaryColor}30`,
                    boxShadow: isDark
                        ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px ${glowColor}30`
                        : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
                }}
            >
                <div
                    className="absolute inset-0 opacity-20 rounded-2xl"
                    style={{
                        backgroundImage: isDark
                            ? `radial-gradient(circle at 20% 30%, ${primaryColor}60 0%, transparent 40%), 
                radial-gradient(circle at 80% 70%, ${secondaryColor}60 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, ${accentColor}40 0%, transparent 60%)`
                            : `radial-gradient(circle at 20% 30%, ${primaryColor}40 0%, transparent 40%), 
                radial-gradient(circle at 80% 70%, ${secondaryColor}40 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, ${accentColor}30 0%, transparent 60%)`,
                    }}
                />

                <div
                    className="relative z-10 p-5 flex items-center justify-between border-b drag-handle"
                    style={{
                        borderColor: isDark ? `${glowColor}30` : `${primaryColor}20`,
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="p-3 rounded-xl"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${primaryColor}40, ${secondaryColor}40)`
                                    : `linear-gradient(135deg, ${primaryColor}30, ${secondaryColor}30)`,
                                boxShadow: `0 8px 20px ${glowColor}40`,
                            }}
                        >
                            <BotIcon
                                className="w-6 h-6"
                                style={{
                                    color: isDark ? "#ffffff" : primaryColor,
                                    filter: `drop-shadow(0 0 8px ${glowColor}60)`,
                                }}
                            />
                        </div>
                        <div>
                            <h3
                                className="text-xl font-bold mb-1"
                                style={{
                                    color: isDark ? "#ffffff" : "#111827",
                                    textShadow: isDark ? `0 0 15px ${glowColor}60` : `0 0 8px ${primaryColor}40`,
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                ¥$
                            </h3>
                            <p
                                className="text-sm"
                                style={{
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    textShadow: isDark ? `0 0 5px ${glowColor}30` : "none",
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                Assistente by Lucas Lima
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1">
                        {isMinimized ? (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsMinimized(false)}
                                className="p-2 rounded-xl transition-colors"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                }}
                            >
                                <Maximize2 className="w-5 h-5" />
                            </motion.button>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsMinimized(true)}
                                className="p-2 rounded-xl transition-colors"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                }}
                            >
                                <Minimize2 className="w-5 h-5" />
                            </motion.button>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onClose}
                            className="p-2 rounded-xl transition-colors"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                color: isDark ? "#d1d5db" : "#6b7280",
                            }}
                        >
                            <X className="w-5 h-5" />
                        </motion.button>
                    </div>
                </div>

                {!isMinimized && (
                    <>
                        <div
                            className="p-4 h-[360px] overflow-y-auto relative z-10"
                            style={{
                                background: isDark
                                    ? `radial-gradient(circle at 50% 50%, rgba(0,0,0,0.8) 0%, ${primaryColor}10 50%, rgba(0,0,0,0.8) 100%)`
                                    : `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, ${primaryColor}05 50%, rgba(255,255,255,0.9) 100%)`,
                            }}
                        >
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`mb-4 ${message.role === "user" ? "flex justify-end" : "flex justify-start"}`}
                                >
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`max-w-[80%] p-4 rounded-xl whitespace-pre-line relative overflow-hidden`}
                                        style={{
                                            background:
                                                message.role === "user"
                                                    ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                                                    : isDark
                                                        ? `linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))`
                                                        : `linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.02))`,
                                            color: message.role === "user" ? "#ffffff" : isDark ? "#f9fafb" : "#111827",
                                            border:
                                                message.role === "user"
                                                    ? `1px solid ${glowColor}60`
                                                    : isDark
                                                        ? `1px solid ${glowColor}20`
                                                        : `1px solid ${primaryColor}20`,
                                            boxShadow:
                                                message.role === "user"
                                                    ? `0 4px 15px ${glowColor}40, 0 0 20px ${glowColor}20`
                                                    : isDark
                                                        ? `0 2px 10px rgba(0,0,0,0.3), 0 0 10px ${glowColor}10`
                                                        : `0 2px 10px rgba(0,0,0,0.1), 0 0 5px ${primaryColor}10`,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                        whileHover={{
                                            scale: 1.02,
                                            boxShadow:
                                                message.role === "user"
                                                    ? `0 6px 20px ${glowColor}50, 0 0 30px ${glowColor}30`
                                                    : isDark
                                                        ? `0 4px 15px rgba(0,0,0,0.4), 0 0 15px ${glowColor}20`
                                                        : `0 4px 15px rgba(0,0,0,0.2), 0 0 10px ${primaryColor}15`,
                                        }}
                                    >
                                        <p className="text-sm">{message.content}</p>
                                    </motion.div>
                                </div>
                            ))}
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleSendMessage()
                            }}
                            className="p-5 border-t relative z-10"
                            style={{
                                borderColor: isDark ? `${glowColor}30` : `${primaryColor}20`,
                            }}
                        >
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Digite sua mensagem..."
                                    className="flex-1 rounded-full px-4 py-3 text-sm transition-all duration-300"
                                    style={{
                                        background: isDark
                                            ? `linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))`
                                            : `linear-gradient(135deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01))`,
                                        border: isDark ? `1px solid ${glowColor}30` : `1px solid ${primaryColor}20`,
                                        color: isDark ? "#f9fafb" : "#111827",
                                        boxShadow: isDark
                                            ? `0 0 0 1px ${glowColor}10, 0 0 10px ${glowColor}15`
                                            : `0 0 0 1px ${primaryColor}10, 0 0 5px ${primaryColor}05`,
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                />
                                <motion.button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="rounded-full w-12 h-12 flex items-center justify-center transition-all duration-300"
                                    style={{
                                        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                                        border: `1px solid ${glowColor}60`,
                                        boxShadow: `0 4px 15px ${glowColor}40, 0 0 20px ${glowColor}20`,
                                    }}
                                    whileHover={{
                                        scale: 1.05,
                                        boxShadow: `0 6px 20px ${glowColor}50, 0 0 30px ${glowColor}30`,
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Send className="h-5 w-5" style={{ color: isDark ? "#ffffff" : "#111827" }} />
                                </motion.button>
                            </div>
                        </form>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    )
}

// Componente do Menu de Imagem com visual padrão
const ImageMenu = ({ isOpen, onClose, onChangeBackground, onSaveImage, onResetBackground, theme }: any) => {
    const { currentGradient } = useTheme()
    const isDark = theme === "dark"
    const primaryColor = currentGradient?.primary || "#000000"
    const secondaryColor = currentGradient?.secondary || "#000000"
    const accentColor = currentGradient?.accent || "#000000"
    const glowColor = currentGradient?.glow || "#000000"

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="sm:max-w-[420px] p-0 bg-transparent border-0"
                style={{
                    background: "transparent",
                    border: "none",
                    boxShadow: "none",
                }}
            >
                <div
                    className="relative rounded-2xl overflow-hidden"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, ${primaryColor}15 50%, rgba(0,0,0,0.95) 100%)`
                            : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${primaryColor}10 50%, rgba(255,255,255,0.95) 100%)`,
                        border: isDark ? `1px solid ${glowColor}40` : `1px solid ${primaryColor}30`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px ${glowColor}30`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
                        backdropFilter: "blur(20px)",
                    }}
                >
                    {/* Animated background pattern */}
                    <div
                        className="absolute inset-0 opacity-20 rounded-2xl"
                        style={{
                            backgroundImage: isDark
                                ? `radial-gradient(circle at 20% 30%, ${primaryColor}60 0%, transparent 40%), 
                  radial-gradient(circle at 80% 70%, ${secondaryColor}60 0%, transparent 40%),
                  radial-gradient(circle at 50% 50%, ${accentColor}40 0%, transparent 60%)`
                                : `radial-gradient(circle at 20% 30%, ${primaryColor}40 0%, transparent 40%), 
                  radial-gradient(circle at 80% 70%, ${secondaryColor}40 0%, transparent 40%),
                  radial-gradient(circle at 50% 50%, ${accentColor}30 0%, transparent 60%)`,
                        }}
                    />

                    {/* Header */}
                    <div
                        className="flex items-center justify-between p-5 border-b"
                        style={{
                            borderColor: isDark ? `${glowColor}30` : `${primaryColor}20`,
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="p-3 rounded-xl"
                                style={{
                                    background: isDark
                                        ? `linear-gradient(135deg, ${primaryColor}40, ${secondaryColor}40)`
                                        : `linear-gradient(135deg, ${primaryColor}30, ${secondaryColor}30)`,
                                    boxShadow: `0 8px 20px ${glowColor}40`,
                                }}
                            >
                                <ImageIcon
                                    className="w-6 h-6"
                                    style={{
                                        color: isDark ? "#ffffff" : primaryColor,
                                        filter: `drop-shadow(0 0 8px ${glowColor}60)`,
                                    }}
                                />
                            </div>
                            <div>
                                <h3
                                    className="text-xl font-bold mb-1"
                                    style={{
                                        color: isDark ? "#ffffff" : "#111827",
                                        textShadow: isDark ? `0 0 15px ${glowColor}60` : `0 0 8px ${primaryColor}40`,
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Opções de Imagem
                                </h3>
                                <p
                                    className="text-sm"
                                    style={{
                                        color: isDark ? "#d1d5db" : "#6b7280",
                                        textShadow: isDark ? `0 0 5px ${glowColor}30` : "none",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Personalize a aparência do seu fluxo de trabalho
                                </p>
                            </div>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onClose}
                            className="p-2 rounded-xl transition-colors"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                color: isDark ? "#d1d5db" : "#6b7280",
                            }}
                        >
                            <X className="w-5 h-5" />
                        </motion.button>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-4">
                        {/* Alterar Background */}
                        <motion.button
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onChangeBackground}
                            className="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))`
                                    : `linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02))`,
                                border: isDark ? `1px solid ${glowColor}30` : `1px solid ${primaryColor}20`,
                                boxShadow: `0 4px 15px ${glowColor}20`,
                            }}
                        >
                            <div
                                className="p-3 rounded-xl"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                }}
                            >
                                <Folder className="w-6 h-6" style={{ color: isDark ? "#d1d5db" : "#6b7280" }} />
                            </div>
                            <div className="flex-1 text-left">
                                <div
                                    className="font-semibold text-base mb-1"
                                    style={{
                                        color: isDark ? "#ffffff" : "#111827",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Alterar Background
                                </div>
                                <div
                                    className="text-sm"
                                    style={{
                                        color: isDark ? "#a1a1aa" : "#71717a",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Escolher nova imagem de fundo para o fluxo
                                </div>
                            </div>
                        </motion.button>

                        {/* Resetar Background */}
                        <motion.button
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onResetBackground}
                            className="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
                            style={{
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                boxShadow: "0 4px 15px rgba(239, 68, 68, 0.2)",
                            }}
                        >
                            <div
                                className="p-3 rounded-xl"
                                style={{
                                    background: "rgba(239, 68, 68, 0.2)",
                                }}
                            >
                                <Trash2 className="w-6 h-6 text-red-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <div
                                    className="font-semibold text-base mb-1"
                                    style={{
                                        color: isDark ? "#ffffff" : "#111827",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Resetar Background
                                </div>
                                <div
                                    className="text-sm"
                                    style={{
                                        color: isDark ? "#a1a1aa" : "#71717a",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Remover imagem de fundo e voltar ao padrão
                                </div>
                            </div>
                        </motion.button>

                        {/* Salvar Imagem */}
                        <motion.button
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onSaveImage}
                            className="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
                            style={{
                                background: "rgba(34, 197, 94, 0.1)",
                                border: "1px solid rgba(34, 197, 94, 0.3)",
                                boxShadow: "0 4px 15px rgba(34, 197, 94, 0.2)",
                            }}
                        >
                            <div
                                className="p-3 rounded-xl"
                                style={{
                                    background: "rgba(34, 197, 94, 0.2)",
                                }}
                            >
                                <Camera className="w-6 h-6 text-green-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <div
                                    className="font-semibold text-base mb-1"
                                    style={{
                                        color: isDark ? "#ffffff" : "#111827",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Salvar Imagem
                                </div>
                                <div
                                    className="text-sm"
                                    style={{
                                        color: isDark ? "#a1a1aa" : "#71717a",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Capturar screenshot do fluxo atual
                                </div>
                            </div>
                        </motion.button>
                    </div>

                    {/* Footer */}
                    <div
                        className="flex justify-end p-5 border-t"
                        style={{
                            borderColor: isDark ? `${glowColor}30` : `${primaryColor}20`,
                        }}
                    >
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-medium rounded-lg transition-colors"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                color: isDark ? "#d1d5db" : "#6b7280",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                            }}
                        >
                            Fechar
                        </motion.button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Flow Header com mesmo padrão visual
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
    const [isSearchFocused, setIsSearchFocused] = useState(false)

    const primaryColor = currentGradient?.primary || "#000000"
    const secondaryColor = currentGradient?.secondary || "#000000"
    const accentColor = currentGradient?.accent || "#000000"
    const glowColor = currentGradient?.glow || "#000000"

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
        const savedWorkflow = localStorage.getItem("workflow")
        if (!savedWorkflow) {
            alert("Por favor, salve o fluxo antes de executar!")
            return
        }

        try {
            const workflow = JSON.parse(savedWorkflow)
            if (!workflow.nodes || workflow.nodes.length === 0) {
                alert("O fluxo está vazio. Adicione alguns nós antes de executar!")
                return
            }

            const hasStartNode = workflow.nodes.some((node: any) => node.id === "start-node" || node.type === "start")
            if (!hasStartNode) {
                alert("O fluxo precisa ter um nó START para ser executado!")
                return
            }

            if (onExecute) {
                onExecute()
                localStorage.setItem("executedFlow", "true") // Set executedFlow to true
                setShowExecuteDialog(true)
            }
        } catch (error) {
            console.error("Erro ao validar fluxo:", error)
            alert("Erro ao validar o fluxo. Por favor, salve novamente!")
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

        headerElement?.classList.add("hiding-for-screenshot")
        sidebarElement?.classList.add("hiding-for-screenshot")
        elegantSidebarElement?.classList.add("hiding-for-screenshot")
        componentsSidebar?.classList.add("hiding-for-screenshot")

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
            link.download = `fluxo-by-lucas-lima-${new Date().toISOString().slice(0, 10)}.png`
            link.href = canvas.toDataURL("image/png", 1.0)
            link.click()

            console.log("Imagem salva com sucesso!")
        } catch (error) {
            console.error("Erro ao salvar imagem:", error)
            alert("Ocorreu um erro ao salvar a imagem. Tente novamente.")
        } finally {
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
            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative z-50 border-b"
                style={{
                    background: isDark
                        ? `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, ${primaryColor}15 50%, rgba(0,0,0,0.95) 100%)`
                        : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${primaryColor}10 50%, rgba(255,255,255,0.95) 100%)`,
                    backdropFilter: "blur(20px)",
                    border: isDark ? `1px solid ${glowColor}40` : `1px solid ${primaryColor}30`,
                    boxShadow: isDark
                        ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px ${glowColor}30`
                        : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
                }}
            >
                {/* Animated background pattern */}
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: isDark
                            ? `radial-gradient(circle at 20% 30%, ${primaryColor}60 0%, transparent 40%), 
                radial-gradient(circle at 80% 70%, ${secondaryColor}60 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, ${accentColor}40 0%, transparent 60%)`
                            : `radial-gradient(circle at 20% 30%, ${primaryColor}40 0%, transparent 40%), 
                radial-gradient(circle at 80% 70%, ${secondaryColor}40 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, ${accentColor}30 0%, transparent 60%)`,
                    }}
                />

                <div className="max-w-full mx-auto px-8 py-4 relative z-10">
                    <div className="flex items-center justify-between">
                        {/* Left Section - Logo & Navigation */}
                        <div className="flex items-center space-x-8">
                            {/* Logo & Back */}
                            <div className="flex items-center space-x-5">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => router.push("/")}
                                    className="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        color: isDark ? "#ffffff" : "#000000",
                                    }}
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </motion.button>

                                <div className="flex items-center space-x-4">
                                    <h1
                                        className="text-xl font-semibold tracking-tight"
                                        style={{
                                            color: isDark ? "#ffffff" : "#000000",
                                            fontWeight: 600,
                                            letterSpacing: "-0.01em",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Flow Builder
                                    </h1>
                                    <div
                                        className="px-3 py-1 rounded-full text-xs font-medium"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                            color: isDark ? "#a1a1aa" : "#71717a",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Beta
                                    </div>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="flex items-center space-x-3">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onToggleSidebar}
                                    className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        color: isDark ? "#a1a1aa" : "#71717a",
                                    }}
                                    title="Toggle Sidebar"
                                >
                                    <PanelLeft className="w-4 h-4" />
                                </motion.button>

                                {/* Zoom Controls */}
                                <div
                                    className="flex items-center rounded-lg p-1 space-x-1"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                    }}
                                >
                                    {[
                                        { icon: ZoomOut, action: onZoomOut, title: "Zoom Out" },
                                        { icon: ZoomIn, action: onZoomIn, title: "Zoom In" },
                                        { icon: Maximize, action: onFitView, title: "Fit View" },
                                    ].map(({ icon: Icon, action, title }, index) => (
                                        <motion.button
                                            key={index}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={action}
                                            className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150"
                                            style={{
                                                color: isDark ? "#a1a1aa" : "#71717a",
                                            }}
                                            title={title}
                                        >
                                            <Icon className="w-4 h-4" />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Center Section - Search & Status */}
                        <div className="flex items-center space-x-8">
                            {/* Search */}
                            <motion.form
                                onSubmit={handleSearch}
                                className="relative"
                                animate={{ width: isSearchFocused ? 300 : 260 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                <div className="relative">
                                    <Search
                                        className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4"
                                        style={{ color: isDark ? "#71717a" : "#a1a1aa" }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Search nodes..."
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        onFocus={() => setIsSearchFocused(true)}
                                        onBlur={() => setIsSearchFocused(false)}
                                        className="w-full h-10 pl-11 pr-4 text-sm rounded-lg border-0 transition-all duration-200 focus:outline-none focus:ring-2"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                            color: isDark ? "#ffffff" : "#000000",
                                            focusRingColor: primaryColor,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    />
                                </div>
                            </motion.form>

                            {/* Status Indicator */}
                            <FlowStatusIndicator
                                startPosition={startPosition}
                                mousePosition={mousePosition}
                                componentCount={componentCount}
                                theme={theme}
                                currentGradient={currentGradient}
                            />
                        </div>

                        {/* Right Section - Actions */}
                        <div className="flex items-center space-x-4">
                            {/* Primary Actions */}
                            <div className="flex items-center space-x-3">
                                {[
                                    {
                                        icon: Save,
                                        action: onSave,
                                        title: "Save",
                                        variant: "custom", // Changed variant to custom
                                    },
                                    {
                                        icon: Upload,
                                        action: onLoad,
                                        title: "Load",
                                        variant: "secondary",
                                    },
                                    {
                                        icon: Download,
                                        action: onDownload,
                                        title: "Export",
                                        variant: "secondary",
                                    },
                                    {
                                        icon: PlayCircle,
                                        action: handleExecute,
                                        title: "Execute",
                                        variant: "primary",
                                    },
                                ].map(({ icon: Icon, action, title, variant }, index) => (
                                    <motion.button
                                        key={index}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={action}
                                        className="flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                                        style={{
                                            background:
                                                variant === "primary"
                                                    ? isDark
                                                        ? "#ffffff"
                                                        : "#000000"
                                                    : variant === "custom" // Custom style for Save button
                                                        ? isDark
                                                            ? `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))`
                                                            : `linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02))`
                                                        : isDark
                                                            ? "rgba(255, 255, 255, 0.1)"
                                                            : "rgba(0, 0, 0, 0.05)",
                                            color: variant === "primary" ? (isDark ? "#000000" : "#ffffff") : isDark ? "#ffffff" : "#000000",
                                            border:
                                                variant === "custom" // Custom border for Save button
                                                    ? isDark
                                                        ? `1px solid ${glowColor}30`
                                                        : `1px solid ${primaryColor}20`
                                                    : "none", // Default for other buttons
                                            boxShadow:
                                                variant === "custom" // Custom box-shadow for Save button
                                                    ? `0 4px 15px ${glowColor}20`
                                                    : "none", // Default for other buttons
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                        title={title}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="hidden sm:inline">{title}</span>
                                    </motion.button>
                                ))}
                            </div>

                            {/* Divider */}
                            <div
                                className="w-px h-7"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                                }}
                            />

                            {/* Utility Actions */}
                            <div className="flex items-center space-x-2">
                                {[
                                    { icon: ImageIcon, action: () => setShowImageMenu(true), title: "Image Options" },
                                    { icon: Settings, action: onOpenColorPanel, title: "Settings" },
                                    { icon: isDark ? Sun : Moon, action: toggleTheme, title: "Toggle Theme" },
                                ].map(({ icon: Icon, action, title }, index) => (
                                    <motion.button
                                        key={index}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={action}
                                        className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                            color: isDark ? "#a1a1aa" : "#71717a",
                                        }}
                                        title={title}
                                    >
                                        <Icon className="w-4 h-4" />
                                    </motion.button>
                                ))}

                                {/* Reset Button - Special */}
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleReset}
                                    className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200"
                                    style={{
                                        background: "rgba(239, 68, 68, 0.1)",
                                        color: "#ef4444",
                                    }}
                                    title="Reset Flow"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </motion.button>

                                {/* Bot Button - Special */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onOpenBot}
                                    className="flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                                    style={{
                                        background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                                        color: "#ffffff",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                    title="Open Bot"
                                >
                                    <BotIcon className="w-4 h-4" />
                                    <span className="hidden lg:inline">¥$ Bot</span>
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* Image Menu Dialog */}
            <ImageMenu
                isOpen={showImageMenu}
                onClose={() => setShowImageMenu(false)}
                onChangeBackground={handleChangeBackground}
                onSaveImage={handleSaveImage}
                onResetBackground={handleResetBackground}
                theme={theme}
            />

            {/* Reset Dialog - Seguindo padrão visual */}
            <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <DialogContent
                    className="sm:max-w-[450px] p-0 bg-transparent border-0"
                    style={{
                        background: "transparent",
                        border: "none",
                        boxShadow: "none",
                    }}
                >
                    <div
                        className="relative rounded-2xl overflow-hidden"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, ${primaryColor}15 50%, rgba(0,0,0,0.95) 100%)`
                                : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${primaryColor}10 50%, rgba(255,255,255,0.95) 100%)`,
                            border: isDark ? `1px solid ${glowColor}40` : `1px solid ${primaryColor}30`,
                            boxShadow: isDark
                                ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px ${glowColor}30`
                                : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
                            backdropFilter: "blur(20px)",
                        }}
                    >
                        <div
                            className="absolute inset-0 opacity-20 rounded-2xl"
                            style={{
                                backgroundImage: isDark
                                    ? `radial-gradient(circle at 20% 30%, ${primaryColor}60 0%, transparent 40%), 
                    radial-gradient(circle at 80% 70%, ${secondaryColor}60 0%, transparent 40%),
                    radial-gradient(circle at 50% 50%, ${accentColor}40 0%, transparent 60%)`
                                    : `radial-gradient(circle at 20% 30%, ${primaryColor}40 0%, transparent 40%), 
                    radial-gradient(circle at 80% 70%, ${secondaryColor}40 0%, transparent 40%),
                    radial-gradient(circle at 50% 50%, ${accentColor}30 0%, transparent 60%)`,
                            }}
                        />

                        <DialogHeader className="relative z-10 p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div
                                    className="p-4 rounded-2xl"
                                    style={{
                                        background: "rgba(239, 68, 68, 0.2)",
                                        boxShadow: "0 8px 20px rgba(239, 68, 68, 0.3)",
                                    }}
                                >
                                    <RefreshCw
                                        className="w-8 h-8 text-red-400"
                                        style={{
                                            filter: `drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))`,
                                        }}
                                    />
                                </div>
                                <div>
                                    <DialogTitle
                                        className="text-xl font-bold mb-1"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark ? `0 0 15px ${glowColor}60` : `0 0 8px ${primaryColor}40`,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Confirmar Reset
                                    </DialogTitle>
                                    <DialogDescription
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#d1d5db" : "#6b7280",
                                            textShadow: isDark ? `0 0 5px ${glowColor}30` : "none",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Tem certeza de que deseja resetar o fluxo?
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="relative z-10 px-6 pb-4">
                            <div
                                className="p-4 rounded-xl flex items-center gap-3"
                                style={{
                                    background: "rgba(239, 68, 68, 0.1)",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                }}
                            >
                                <X className="w-5 h-5 text-red-400" />
                                <p
                                    className="text-sm font-medium"
                                    style={{
                                        color: isDark ? "#fca5a5" : "#dc2626",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Esta ação é irreversível e todas as alterações não salvas serão perdidas.
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10 flex justify-end gap-3 p-6 pt-0">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setShowResetDialog(false)}
                                className="px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    color: isDark ? "#d1d5db" : "#6b7280",
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.1)",
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                Cancelar
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={confirmReset}
                                className="px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                                style={{
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                    color: "#ffffff",
                                    border: "1px solid #dc2626",
                                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                <Trash2 className="w-4 h-4" />
                                Resetar
                            </motion.button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Execute Dialog - Seguindo padrão visual */}
            <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
                <DialogContent
                    className="sm:max-w-[450px] p-0 bg-transparent border-0"
                    style={{
                        background: "transparent",
                        border: "none",
                        boxShadow: "none",
                    }}
                >
                    <div
                        className="relative rounded-2xl overflow-hidden"
                        style={{
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, ${primaryColor}15 50%, rgba(0,0,0,0.95) 100%)`
                                : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${primaryColor}10 50%, rgba(255,255,255,0.95) 100%)`,
                            border: isDark ? `1px solid ${glowColor}40` : `1px solid ${primaryColor}30`,
                            boxShadow: isDark
                                ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px ${glowColor}30`
                                : `0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
                            backdropFilter: "blur(20px)",
                        }}
                    >
                        <div
                            className="absolute inset-0 opacity-20 rounded-2xl"
                            style={{
                                backgroundImage: isDark
                                    ? `radial-gradient(circle at 20% 30%, ${primaryColor}60 0%, transparent 40%), 
                    radial-gradient(circle at 80% 70%, ${secondaryColor}60 0%, transparent 40%),
                    radial-gradient(circle at 50% 50%, ${accentColor}40 0%, transparent 60%)`
                                    : `radial-gradient(circle at 20% 30%, ${primaryColor}40 0%, transparent 40%), 
                    radial-gradient(circle at 80% 70%, ${secondaryColor}40 0%, transparent 40%),
                    radial-gradient(circle at 50% 50%, ${accentColor}30 0%, transparent 60%)`,
                            }}
                        />

                        <DialogHeader className="relative z-10 p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div
                                    className="p-4 rounded-2xl"
                                    style={{
                                        background: "rgba(34, 197, 94, 0.2)",
                                        boxShadow: "0 8px 20px rgba(34, 197, 94, 0.3)",
                                    }}
                                >
                                    <PlayCircle
                                        className="w-8 h-8 text-green-400"
                                        style={{
                                            filter: `drop-shadow(0 0 8px rgba(34, 197, 94, 0.6))`,
                                        }}
                                    />
                                </div>
                                <div>
                                    <DialogTitle
                                        className="text-xl font-bold mb-1"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark ? `0 0 15px ${glowColor}60` : `0 0 8px ${primaryColor}40`,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Fluxo em Execução
                                    </DialogTitle>
                                    <DialogDescription
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#d1d5db" : "#6b7280",
                                            textShadow: isDark ? `0 0 5px ${glowColor}30` : "none",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        O fluxo está sendo executado com sucesso.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="relative z-10 px-6 pb-4">
                            <div
                                className="p-4 rounded-xl flex items-center gap-3"
                                style={{
                                    background: "rgba(34, 197, 94, 0.1)",
                                    border: "1px solid rgba(34, 197, 94, 0.2)",
                                }}
                            >
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <p
                                    className="text-sm font-medium"
                                    style={{
                                        color: isDark ? "#86efac" : "#16a34a",
                                        fontFamily: "system-ui, -apple-system, sans-serif",
                                    }}
                                >
                                    Abra o ¥$ Bot para interagir com o fluxo executado.
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10 flex justify-end p-6 pt-0">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setShowExecuteDialog(false)}
                                className="px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200"
                                style={{
                                    background: isDark
                                        ? `linear-gradient(135deg, ${primaryColor}60, ${secondaryColor}60)`
                                        : `linear-gradient(135deg, ${primaryColor}50, ${secondaryColor}50)`,
                                    color: "white",
                                    border: isDark ? `1px solid ${glowColor}50` : `1px solid ${primaryColor}50`,
                                    boxShadow: `0 4px 12px ${glowColor}40`,
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                Entendi
                            </motion.button>
                        </div>
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

            <YenFlowBot isOpen={showBot} onClose={closeBot} />

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
