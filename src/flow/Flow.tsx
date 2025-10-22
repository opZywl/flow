"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { ThemeProvider, useTheme } from "../ThemeContext"
import ColorPanel from "../ColorPanel"
import WorkflowBuilder from "./workflow-builder"
import { useRouter } from "next/navigation"
import {
    FiSave,
    FiPlayCircle,
    FiPlay,
    FiDownload,
    FiSun,
    FiZoomIn,
    FiZoomOut,
    FiMaximize,
    FiRefreshCw,
    FiMapPin,
    FiLayers,
    FiX,
    FiMinimize2,
    FiMaximize2,
    FiSend,
    FiCheckCircle,
    FiXCircle,
    FiImage,
    FiCamera,
    FiFolder,
    FiTrash2,
    FiNavigation,
    FiUpload,
    FiDroplet,
    FiGrid,
    FiZap,
    FiSidebar,
} from "react-icons/fi"
import { BotIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar } from "@/components/ui/avatar"
import { motion, AnimatePresence } from "framer-motion"
import html2canvas from "html2canvas"
import IntegrationsMenu from "./integrations/IntegrationsMenu"
import AIWorkflowDialog from "./ai-workflow-dialog"
import { toast } from "@/hooks/use-toast"

const FlowElegantSidebar = ({ currentGradient, theme }: { currentGradient: any; theme: string }) => {
    return (
        <div className="fixed left-0 top-0 h-full z-50 flex items-center pointer-events-none">
            <div
                className="h-[80%] w-[3px] rounded-full relative overflow-hidden panel-glow"
                style={{
                    background: `linear-gradient(to bottom, ${currentGradient.glow}, transparent, ${currentGradient.glow})`,
                }}
            >
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

const FlowStatusIndicator = ({ startPosition, mousePosition, componentCount, theme, currentGradient }: any) => {
    const isDark = theme === "dark"
    const [isExecuted, setIsExecuted] = useState(false)

    useEffect(() => {
        const executedFlow = localStorage.getItem("executedFlow")
        setIsExecuted(executedFlow === "true")
    }, [])

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
            className="flex items-center space-x-4 px-4 py-2 rounded-xl text-xs pointer-events-none"
            style={{
                background: isDark
                    ? `linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04))`
                    : `linear-gradient(135deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.02))`,
                border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.08)",
                color: isDark ? "#e4e4e7" : "#52525b",
                fontFamily: "system-ui, -apple-system, sans-serif",
            }}
        >
            <div className="flex items-center space-x-2">
                <motion.div
                    animate={{
                        scale: isExecuted ? [1, 1.1, 1] : 1,
                    }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                >
                    {isExecuted ? (
                        <FiCheckCircle
                            className="h-3.5 w-3.5 text-emerald-500"
                            style={{
                                filter: `drop-shadow(0 0 4px rgba(16, 185, 129, 0.6))`,
                            }}
                        />
                    ) : (
                        <FiXCircle
                            className="h-3.5 w-3.5 text-rose-500"
                            style={{
                                filter: `drop-shadow(0 0 4px rgba(244, 63, 94, 0.6))`,
                            }}
                        />
                    )}
                </motion.div>
                <span className="font-medium">{isExecuted ? "Ativo" : "Inativo"}</span>
            </div>

            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            <div className="flex items-center space-x-2">
                <FiMapPin
                    className="h-3.5 w-3.5"
                    style={{
                        color: currentGradient.glow,
                        filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
                    }}
                />
                <span className="font-mono text-xs">
          START ({Math.round(startPosition.x)}, {Math.round(startPosition.y)})
        </span>
            </div>

            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            <div className="flex items-center space-x-2">
                <FiNavigation
                    className="h-3.5 w-3.5"
                    style={{
                        color: currentGradient.glow,
                        filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
                    }}
                />
                <span className="font-mono text-xs">
          Mouse ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
        </span>
            </div>

            <div
                className="w-px h-4"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
                }}
            />

            <div className="flex items-center space-x-2">
                <FiLayers
                    className="h-3.5 w-3.5"
                    style={{
                        color: currentGradient.glow,
                        filter: `drop-shadow(0 0 4px ${currentGradient.glow}60)`,
                    }}
                />
                <span className="font-medium">{componentCount} Componentes</span>
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
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { theme, currentGradient } = useTheme()

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

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
        }
    }, [messages])

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
                className="fixed w-full max-w-sm rounded-xl shadow-2xl overflow-hidden z-50"
                style={{
                    ...chatStyle,
                    background: isDark
                        ? `linear-gradient(135deg, rgba(9,9,11,0.98) 0%, rgba(24,24,27,0.98) 100%)`
                        : `linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(250,250,250,0.98) 100%)`,
                    backdropFilter: "blur(20px)",
                    border: isDark ? `1px solid rgba(139,92,246,0.3)` : `1px solid rgba(192,132,252,0.3)`,
                    boxShadow: isDark
                        ? `0 20px 40px -12px rgba(0, 0, 0, 0.5),
             0 0 0 1px rgba(139,92,246,0.2),
             inset 0 1px 0 rgba(255, 255, 255, 0.05)`
                        : `0 20px 40px -12px rgba(0, 0, 0, 0.15),
             0 0 0 1px rgba(192,132,252,0.2),
             inset 0 1px 0 rgba(255, 255, 255, 0.8)`,
                }}
            >
                <div
                    className="absolute inset-0 opacity-10 rounded-xl"
                    style={{
                        backgroundImage: isDark
                            ? `radial-gradient(circle at 20% 30%, rgba(139,92,246,0.3) 0%, transparent 50%),
               radial-gradient(circle at 80% 70%, rgba(217,70,239,0.2) 0%, transparent 50%)`
                            : `radial-gradient(circle at 20% 30%, rgba(192,132,252,0.2) 0%, transparent 50%),
               radial-gradient(circle at 80% 70%, rgba(232,121,249,0.15) 0%, transparent 50%)`,
                    }}
                />

                <div
                    className="relative z-10 p-3 flex items-center justify-between border-b drag-handle"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, rgba(139,92,246,0.15), rgba(217,70,239,0.1))`
                            : `linear-gradient(135deg, rgba(192,132,252,0.1), rgba(232,121,249,0.08))`,
                        borderColor: isDark ? `rgba(139,92,246,0.2)` : `rgba(192,132,252,0.2)`,
                        boxShadow: "none",
                    }}
                >
                    <div className="flex items-center space-x-3">
                        <Avatar
                            className="h-10 w-10"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, ${currentGradient.primary}50, ${currentGradient.secondary}50)`
                                    : `linear-gradient(135deg, ${currentGradient.primary}60, ${currentGradient.secondary}60)`,
                                boxShadow: isDark ? `0 0 20px ${currentGradient.glow}40` : `0 0 20px ${currentGradient.glow}30`,
                                border: isDark ? `1px solid ${currentGradient.glow}60` : `1px solid ${currentGradient.glow}50`,
                            }}
                        >
                            <div className="flex items-center justify-center h-full w-full">
                                <BotIcon className="h-6 w-6" style={{ color: isDark ? "#ffffff" : currentGradient.primary }} />
                            </div>
                        </Avatar>
                        <div>
                            <h3
                                className="text-base font-bold"
                                style={{
                                    color: isDark ? "#f4f4f5" : "#18181b",
                                    textShadow: "none",
                                }}
                            >
                                ¥$
                            </h3>
                            <p
                                className="text-xs"
                                style={{
                                    color: isDark ? "#a1a1aa" : "#71717a",
                                    textShadow: "none",
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
                                className="h-8 w-8 rounded-full flex items-center justify-center"
                                style={{
                                    color: isDark ? currentGradient.glow : currentGradient.primary,
                                    filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                }}
                            >
                                <FiMaximize2 className="h-5 w-5" />
                            </motion.button>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsMinimized(true)}
                                className="h-8 w-8 rounded-full flex items-center justify-center"
                                style={{
                                    color: isDark ? currentGradient.glow : currentGradient.primary,
                                    filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                                }}
                            >
                                <FiMinimize2 className="h-5 w-5" />
                            </motion.button>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onClose}
                            className="h-8 w-8 rounded-full flex items-center justify-center"
                            style={{
                                color: isDark ? currentGradient.glow : currentGradient.primary,
                                filter: `drop-shadow(0 0 6px ${currentGradient.glow})`,
                            }}
                        >
                            <FiX className="h-5 w-5" />
                        </motion.button>
                    </div>
                </div>

                {!isMinimized && (
                    <>
                        <div
                            className="p-4 h-[360px] overflow-y-auto relative z-10"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, rgba(0,0,0,0.6) 0%, ${currentGradient.primary}08 50%, rgba(0,0,0,0.6) 100%)`
                                    : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${currentGradient.primary}05 50%, rgba(255,255,255,0.95) 100%)`,
                                backdropFilter: "blur(10px)",
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
                                                    ? `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`
                                                    : isDark
                                                        ? `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)`
                                                        : `linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.02) 100%)`,
                                            color: message.role === "user" ? "#ffffff" : isDark ? "#f9fafb" : "#181818",
                                            border:
                                                message.role === "user"
                                                    ? `1px solid ${currentGradient.glow}60`
                                                    : isDark
                                                        ? `1px solid rgba(255,255,255,0.1)`
                                                        : `1px solid rgba(0,0,0,0.08)`,
                                            boxShadow:
                                                message.role === "user"
                                                    ? `0 4px 15px ${currentGradient.glow}40, 0 0 20px ${currentGradient.glow}20`
                                                    : isDark
                                                        ? `0 2px 8px rgba(0,0,0,0.2)`
                                                        : `0 2px 8px rgba(0,0,0,0.08)`,
                                            backdropFilter: "blur(10px)",
                                            fontWeight: message.role === "user" ? "500" : "400",
                                        }}
                                        whileHover={{
                                            scale: 1.02,
                                            boxShadow:
                                                message.role === "user"
                                                    ? `0 6px 20px ${currentGradient.glow}50, 0 0 30px ${currentGradient.glow}30`
                                                    : isDark
                                                        ? `0 4px 12px rgba(0,0,0,0.3)`
                                                        : `0 4px 12px rgba(0,0,0,0.12)`,
                                        }}
                                    >
                                        <p className={`text-sm leading-relaxed ${message.role === "user" ? "font-semibold" : ""}`}>
                                            {message.content}
                                        </p>
                                    </motion.div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleSendMessage()
                            }}
                            className="p-3 border-t relative z-10"
                            style={{
                                background: isDark
                                    ? `linear-gradient(135deg, rgba(0,0,0,0.6) 0%, ${currentGradient.primary}08 50%, rgba(0,0,0,0.6) 100%)`
                                    : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${currentGradient.primary}05 50%, rgba(255,255,255,0.95) 100%)`,
                                borderColor: isDark ? `${currentGradient.glow}20` : `${currentGradient.primary}15`,
                                backdropFilter: "blur(10px)",
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
                                            ? `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)`
                                            : `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.95) 100%)`,
                                        border: isDark ? `1px solid rgba(255,255,255,0.1)` : `1px solid rgba(0,0,0,0.08)`,
                                        color: isDark ? "#f9fafb" : "#111827",
                                        boxShadow: isDark ? `0 2px 8px rgba(0,0,0,0.2)` : `0 2px 8px rgba(0,0,0,0.08)`,
                                        backdropFilter: "blur(10px)",
                                    }}
                                />
                                <motion.button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="rounded-full w-12 h-12 flex items-center justify-center transition-all duration-300"
                                    style={{
                                        background: `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`,
                                        border: `1px solid ${currentGradient.glow}60`,
                                        boxShadow: `0 4px 15px ${currentGradient.glow}40, 0 0 20px ${currentGradient.glow}20`,
                                    }}
                                    whileHover={{
                                        scale: 1.05,
                                        boxShadow: `0 6px 20px ${currentGradient.glow}50, 0 0 30px ${currentGradient.glow}30`,
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <FiSend className="h-5 w-5 text-white" />
                                </motion.button>
                            </div>
                        </form>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    )
}

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

                    <DialogHeader
                        className="relative z-10 p-5 border-b"
                        style={{ borderColor: isDark ? `${glowColor}30` : `${primaryColor}20` }}
                    >
                        <div className="flex items-center justify-between">
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
                                    <FiImage
                                        className="w-6 h-6"
                                        style={{
                                            color: isDark ? "#ffffff" : primaryColor,
                                            filter: `drop-shadow(0 0 8px ${glowColor}60)`,
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
                                        Opções de Imagem
                                    </DialogTitle>
                                    <DialogDescription
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#d1d5db" : "#6b7280",
                                            textShadow: isDark ? `0 0 5px ${glowColor}30` : "none",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Personalize a aparência do seu fluxo de trabalho
                                    </DialogDescription>
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
                                <FiX className="w-5 h-5" />
                            </motion.button>
                        </div>
                    </DialogHeader>

                    <div className="relative z-10 p-5 space-y-4">
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
                                <FiFolder className="w-6 h-6" style={{ color: isDark ? "#d1d5db" : "#6b7280" }} />
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
                                    Escolher nova imagem de fundo do fluxo
                                </div>
                            </div>
                        </motion.button>

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
                                <FiTrash2 className="w-6 h-6 text-red-400" />
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
                                <FiCamera className="w-6 h-6 text-green-400" />
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

                    <div
                        className="relative z-10 flex justify-end p-5 border-t"
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

const FlowHeaderWithDialogs = ({
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
                                   onOpenAIDialog,
                                   startPosition,
                                   mousePosition,
                                   componentCount,
                                   workflowContainerRef,
                               }: any) => {
    const router = useRouter()
    const { theme, toggleTheme, currentGradient, glowAnimation, glowEnabled, setShowColorPanel, showColorPanel } =
        useTheme()
    const [searchValue, setSearchValue] = useState("")
    const [showResetDialog, setShowResetDialog] = useState(false)
    const [showExecuteDialog, setShowExecuteDialog] = useState(false)
    const [showImageMenu, setShowImageMenu] = useState(false)
    const [showIntegrationsMenu, setShowIntegrationsMenu] = useState(false)
    const [isWorkflowSaved, setIsWorkflowSaved] = useState(false)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [showSearchResults, setShowSearchResults] = useState(false)
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)

    useEffect(() => {
        setIsWorkflowSaved(false)
    }, [componentCount])


    const primaryColor = currentGradient?.primary || "#000000"
    const secondaryColor = currentGradient?.secondary || "#000000"
    const accentColor = currentGradient?.accent || "#000000"
    const glowColor = currentGradient?.glow || "#000000"

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()

        // Get all components from localStorage
        const savedWorkflow = localStorage.getItem("workflow")
        if (savedWorkflow) {
            try {
                const workflow = JSON.parse(savedWorkflow)
                const components = workflow.nodes
                    .filter((node: any) => node.id !== "start-node")
                    .map((node: any) => ({
                        id: node.data.customId || node.id,
                        name: node.data.label || node.type,
                        type: node.type,
                    }))

                setSearchResults(components)
                setShowSearchResults(true)
                setIsSearchModalOpen(true)
            } catch (error) {
                console.error("Error loading components:", error)
            }
        }
    }

    const handleSave = () => {
        if (onSave) {
            try {
                const result = onSave()
                setIsWorkflowSaved(result !== false) // undefined passa a contar como sucesso (igual à versão old)
            } catch {
                setIsWorkflowSaved(false)
            }
        }
    }

    const handleExecute = () => {
        if (!isWorkflowSaved) {
            toast({
                title: "❌ Salve primeiro!",
                description: "Você precisa salvar o fluxo antes de executar",
                variant: "destructive",
            })
            return
        }
        setShowExecuteDialog(true)
    }

    const confirmExecute = () => {
        onExecute()
        setShowExecuteDialog(false)
    }

    const handleReset = () => {
        setShowResetDialog(true)
    }

    const confirmReset = () => {
        onReset()
        setShowResetDialog(false)
        setIsWorkflowSaved(false)
    }

    const isDark = theme === "dark"

    // ADDED HANDLERS
    const handleChangeBackground = useCallback(() => {
        console.log("Changing background...")
        const imageUrl = prompt("Enter image URL for background:")
        if (imageUrl) {
            localStorage.setItem("flow-background-image", imageUrl)
            document.documentElement.style.setProperty("--flow-background-image", `url(${imageUrl})`)
        }
    }, [])

    const handleSaveImage = useCallback(async () => {
        console.log("Saving image...")
        if (workflowContainerRef.current) {
            try {
                const canvas = await html2canvas(workflowContainerRef.current, {
                    useCORS: true,
                    backgroundColor: null,
                    allowTaint: true,
                })
                const image = canvas.toDataURL("image/png")
                const link = document.createElement("a")
                link.download = "workflow.png"
                link.href = image
                link.click()
            } catch (error) {
                console.error("Error saving image:", error)
                alert("Failed to save image. Please check browser console for details.")
            }
        }
    }, [])

    const handleResetBackground = useCallback(() => {
        console.log("Resetting background...")
        localStorage.removeItem("flow-background-image")
        document.documentElement.style.setProperty("--flow-background-image", "url(/background-pattern.png)")
    }, [])

    return (
        <>
            <style jsx global>{`
                @keyframes shimmer {
                    0%,
                    100% {
                        text-shadow:
                                0 0 5px rgba(255, 255, 255, 0.5),
                                0 0 10px rgba(255, 255, 255, 0.3);
                    }
                    50% {
                        text-shadow:
                                0 0 10px rgba(255, 255, 255, 0.8),
                                0 0 20px rgba(255, 255, 255, 0.5),
                                0 0 30px rgba(255, 255, 255, 0.3);
                    }
                }
            `}</style>

            {isSearchModalOpen && showSearchResults && searchResults.length > 0 && (
                <div
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-32"
                    style={{
                        backdropFilter: "blur(8px)",
                        background: "rgba(0, 0, 0, 0.5)",
                    }}
                    onClick={() => {
                        setIsSearchModalOpen(false)
                        setShowSearchResults(false)
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="w-full max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden"
                        style={{
                            background: isDark ? "rgba(20, 20, 30, 0.98)" : "rgba(255, 255, 255, 0.98)",
                            border: `2px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}`,
                            backdropFilter: "blur(20px)",
                            boxShadow: `0 20px 60px rgba(0, 0, 0, 0.4), 0 0 40px ${glowColor}30`,
                            maxHeight: "70vh",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Search Header */}
                        <div
                            className="px-6 py-4 border-b"
                            style={{
                                borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                                background: isDark ? "rgba(30, 30, 40, 0.5)" : "rgba(250, 250, 250, 0.5)",
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <h3
                                    className="text-xl font-bold"
                                    style={{
                                        color: isDark ? "#ffffff" : "#1f2937",
                                    }}
                                >
                                    Resultados da Busca
                                </h3>
                                <button
                                    onClick={() => {
                                        setIsSearchModalOpen(false)
                                        setShowSearchResults(false)
                                    }}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        color: isDark ? "#e5e7eb" : "#6b7280",
                                    }}
                                >
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Search Results */}
                        <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 80px)" }}>
                            {searchResults.map((component, index) => (
                                <motion.div
                                    key={index}
                                    whileHover={{
                                        backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.1)",
                                        x: 4,
                                    }}
                                    className="px-6 py-5 cursor-pointer border-b transition-all"
                                    style={{
                                        borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                                    }}
                                    onClick={() => {
                                        if (onSearch) onSearch(component.id)
                                        setShowSearchResults(false)
                                        setIsSearchModalOpen(false)
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div
                                                className="font-semibold text-lg mb-2"
                                                style={{
                                                    color: isDark ? "#ffffff" : "#1f2937",
                                                }}
                                            >
                                                {component.name}
                                            </div>
                                            <div
                                                className="text-base flex items-center gap-2"
                                                style={{
                                                    color: isDark ? "#9ca3af" : "#6b7280",
                                                }}
                                            >
                                                <span className="font-mono">ID: {component.id}</span>
                                                <span
                                                    className="px-2 py-0.5 rounded text-xs"
                                                    style={{
                                                        background: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)",
                                                        color: isDark ? "#60a5fa" : "#3b82f6",
                                                    }}
                                                >
                          {component.type}
                        </span>
                                            </div>
                                        </div>
                                        <div
                                            className="px-4 py-2 rounded-lg text-sm font-medium"
                                            style={{
                                                background: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)",
                                                color: isDark ? "#60a5fa" : "#3b82f6",
                                            }}
                                        >
                                            Localizar
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}

            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="fixed top-0 left-0 right-0 z-50 px-4 py-3"
                style={{
                    background: showColorPanel
                        ? isDark
                            ? `var(--header-bg, ${primaryColor || "#1e293b"})15`
                            : "rgba(255, 255, 255, 0.85)"
                        : isDark
                            ? `var(--header-bg, ${primaryColor || "#1e293b"})10`
                            : "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(20px)",
                    borderBottom: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}`,
                    minHeight: "60px",
                    maxHeight: "60px",
                    transition: "all 0.3s ease",
                    ...(glowEnabled && {
                        boxShadow: `0 0 60px ${glowColor}60, 0 0 120px ${glowColor}30, inset 0 0 40px ${glowColor}10`,
                        borderBottom: `1px solid ${glowColor}80`,
                        background: isDark
                            ? `linear-gradient(180deg, var(--header-bg, ${primaryColor || "#1e293b"})20 0%, var(--header-bg, ${primaryColor || "#1e293b"})15 100%)`
                            : `linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 245, 250, 0.9) 100%)`,
                    }),
                }}
            >
                <div className="flex items-center justify-between h-full">
                    {/* Left Section: Zoom Controls */}
                    <div className="flex items-center gap-3">
                        <div
                            className="flex items-center gap-1 px-1 py-1 rounded-full"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                boxShadow: glowEnabled ? `0 0 15px ${glowColor}20` : "none",
                            }}
                        >
                            {[
                                { icon: FiZoomOut, action: onZoomOut, title: "Zoom Out" },
                                { icon: FiZoomIn, action: onZoomIn, title: "Zoom In" },
                                { icon: FiMaximize, action: onFitView, title: "Fit View" },
                                { icon: FiSidebar, action: onToggleSidebar, title: "Toggle Sidebar" },
                            ].map(({ icon: Icon, action, title }, index) => (
                                <motion.button
                                    key={index}
                                    whileHover={{
                                        scale: 1.1,
                                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={action}
                                    className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                                    style={{
                                        color: isDark ? "#9ca3af" : "#6b7280",
                                    }}
                                    title={title}
                                >
                                    <Icon className="w-4 h-4" />
                                </motion.button>
                            ))}
                        </div>

                        <div
                            className="flex items-center gap-1 px-1 py-1 rounded-full"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                boxShadow: glowEnabled ? `0 0 15px ${glowColor}20` : "none",
                            }}
                        >
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onOpenAIDialog}
                                className="h-9 px-4 rounded-full flex items-center gap-2 transition-all relative overflow-hidden"
                                style={{
                                    background: isDark
                                        ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                                        : `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                                    border: `1px solid ${glowColor}40`,
                                    boxShadow: `0 4px 15px ${glowColor}30, 0 0 20px ${glowColor}20`,
                                }}
                                title="Gerar com IA"
                            >
                                <FiZap className="w-4 h-4" style={{ color: isDark ? "#ffffff" : "#1f2937" }} />
                                <span
                                    className="text-sm font-medium relative"
                                    style={{
                                        color: isDark ? "#ffffff" : "#1f2937",
                                        animation: "shimmer 2s infinite",
                                    }}
                                >
                  Gerar com IA
                </span>
                            </motion.button>

                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    boxShadow: `0 0 20px ${accentColor}60`,
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={onOpenBot}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                                style={{
                                    background: isDark
                                        ? `linear-gradient(135deg, ${accentColor}, ${secondaryColor})`
                                        : `linear-gradient(135deg, ${accentColor}, ${secondaryColor})`,
                                    border: `1px solid ${accentColor}40`,
                                    boxShadow: `0 4px 15px ${accentColor}30`,
                                }}
                                title="Open Bot"
                            >
                                <BotIcon className="w-4 h-4" style={{ color: isDark ? "#ffffff" : "#1f2937" }} />
                            </motion.button>

                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    backgroundColor: "rgba(30, 58, 138, 0.3)",
                                    boxShadow: "0 0 20px rgba(30, 58, 138, 0.6)",
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setShowIntegrationsMenu(true)}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                                style={{
                                    color: isDark ? "#9ca3af" : "#6b7280",
                                }}
                                title="Integrations"
                            >
                                <FiGrid className="w-4 h-4" />
                            </motion.button>
                        </div>

                        <div className="flex items-center gap-2">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onLoad}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#60a5fa" : "#3b82f6",
                                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                    border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                }}
                                title="Import Workflow"
                            >
                                <FiUpload className="w-4 h-4" />
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onDownload}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#60a5fa" : "#3b82f6",
                                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                    border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                }}
                                title="Export Workflow"
                            >
                                <FiDownload className="w-4 h-4" />
                            </motion.button>
                        </div>
                    </div>

                    {/* Center Section: Search + Status */}
                    <div className="flex-1 flex items-center justify-center gap-4 max-w-2xl">
                        <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
                            <div
                                className="relative rounded-full overflow-hidden transition-all"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                    border: `1px solid ${isSearchFocused ? glowColor : isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                    boxShadow: isSearchFocused ? `0 0 20px ${glowColor}30` : "none",
                                }}
                            >
                                <input
                                    type="text"
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    onFocus={() => setIsSearchFocused(true)}
                                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                    placeholder="Procurar ID do Componente"
                                    className="w-full px-4 py-2 bg-transparent outline-none text-sm"
                                    style={{
                                        color: isDark ? "#e5e7eb" : "#1f2937",
                                    }}
                                />
                            </div>

                            {showSearchResults && searchResults.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="absolute top-full mt-2 w-full rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto"
                                    style={{
                                        background: isDark ? "rgba(20, 20, 30, 0.98)" : "rgba(255, 255, 255, 0.98)",
                                        border: `2px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}`,
                                        backdropFilter: "blur(20px)",
                                        boxShadow: `0 10px 40px rgba(0, 0, 0, 0.3), 0 0 20px ${glowColor}20`,
                                    }}
                                >
                                    {searchResults.map((component, index) => (
                                        <motion.div
                                            key={index}
                                            whileHover={{
                                                backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.1)",
                                                x: 4,
                                            }}
                                            className="px-5 py-4 cursor-pointer border-b transition-all"
                                            style={{
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                                            }}
                                            onClick={() => {
                                                if (onSearch) onSearch(component.id)
                                                setShowSearchResults(false)
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div
                                                        className="font-semibold text-base mb-1"
                                                        style={{
                                                            color: isDark ? "#ffffff" : "#1f2937",
                                                        }}
                                                    >
                                                        {component.name}
                                                    </div>
                                                    <div
                                                        className="text-sm"
                                                        style={{
                                                            color: isDark ? "#9ca3af" : "#6b7280",
                                                        }}
                                                    >
                                                        ID: {component.id}
                                                    </div>
                                                </div>
                                                <div
                                                    className="px-3 py-1 rounded-full text-xs font-medium"
                                                    style={{
                                                        background: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)",
                                                        color: isDark ? "#60a5fa" : "#3b82f6",
                                                    }}
                                                >
                                                    Ver
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </form>

                        <FlowStatusIndicator
                            startPosition={startPosition}
                            mousePosition={mousePosition}
                            componentCount={componentCount}
                            theme={theme}
                            currentGradient={currentGradient}
                        />
                    </div>

                    {/* Right Section: Utility Buttons + Save + Execute */}
                    <div className="flex items-center gap-3">
                        <motion.div
                            className="flex items-center gap-1 px-1 py-1 rounded-full"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                boxShadow: glowEnabled ? `0 0 15px ${glowColor}20` : "none",
                            }}
                            animate={glowEnabled ? glowAnimation : {}}
                        >
                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setShowImageMenu(true)}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#9ca3af" : "#6b7280",
                                }}
                                title="Background Image"
                            >
                                <FiImage className="w-4 h-4" />
                            </motion.button>

                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={onOpenColorPanel}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#9ca3af" : "#6b7280",
                                }}
                                title="Cores"
                            >
                                <FiDroplet className="w-4 h-4" />
                            </motion.button>

                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={toggleTheme}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#9ca3af" : "#6b7280",
                                }}
                                title="Toggle Theme"
                            >
                                <FiSun className="w-4 h-4" />
                            </motion.button>

                            <motion.button
                                whileHover={{
                                    scale: 1.1,
                                    backgroundColor: "rgba(239, 68, 68, 0.2)",
                                    boxShadow: "0 0 20px rgba(239, 68, 68, 0.6)",
                                }}
                                whileTap={{ scale: 0.9 }}
                                onClick={handleReset}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                                style={{
                                    color: isDark ? "#9ca3af" : "#6b7280",
                                }}
                                title="Reset Workflow"
                            >
                                <FiRefreshCw className="w-4 h-4" />
                            </motion.button>
                        </motion.div>

                        {/* Save Button */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSave}
                            className="px-4 py-2 rounded-full flex items-center gap-2 transition-all"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"}`,
                                color: isDark ? "#e5e7eb" : "#1f2937",
                            }}
                        >
                            <FiSave className="w-4 h-4" />
                            <span className="text-sm font-medium">Save</span>
                        </motion.button>

                        {/* Execute Button */}
                        <motion.button
                            whileHover={isWorkflowSaved ? { scale: 1.05 } : {}}
                            whileTap={isWorkflowSaved ? { scale: 0.95 } : {}}
                            onClick={handleExecute}
                            disabled={!isWorkflowSaved}
                            className="px-4 py-2 rounded-full flex items-center gap-2 transition-all"
                            style={{
                                background: isWorkflowSaved
                                    ? isDark
                                        ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                                        : `linear-gradient(135deg, ${primaryColor}DD, ${secondaryColor}DD)`
                                    : isDark
                                        ? "rgba(255, 255, 255, 0.05)"
                                        : "rgba(0, 0, 0, 0.03)",
                                border: `1px solid ${isWorkflowSaved ? glowColor : isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
                                // Always white text when enabled (works on gradient), gray when disabled
                                color: isWorkflowSaved ? "#ffffff" : isDark ? "#6b7280" : "#9ca3af",
                                cursor: isWorkflowSaved ? "pointer" : "not-allowed",
                                opacity: isWorkflowSaved ? 1 : 0.5,
                            }}
                        >
                            <FiPlay
                                className="w-4 h-4"
                                style={{ color: isWorkflowSaved ? "#ffffff" : isDark ? "#6b7280" : "#9ca3af" }}
                            />
                            <span className="text-sm font-medium">Execute</span>
                        </motion.button>
                    </div>
                </div>
            </motion.header>

            <IntegrationsMenu
                isOpen={showIntegrationsMenu}
                onClose={() => setShowIntegrationsMenu(false)}
                theme={theme}
                currentGradient={currentGradient}
            />

            <ImageMenu
                isOpen={showImageMenu}
                onClose={() => setShowImageMenu(false)}
                onChangeBackground={handleChangeBackground}
                onSaveImage={handleSaveImage}
                onResetBackground={handleResetBackground}
                theme={theme}
            />

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
                                    <FiRefreshCw
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
                                <FiX className="w-5 h-5 text-red-400" />
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
                                <FiTrash2 className="w-4 h-4" />
                                Resetar
                            </motion.button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

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
                                        background: `linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(16, 185, 129, 0.2))`,
                                        boxShadow: "0 8px 20px rgba(34, 197, 94, 0.4), 0 0 30px rgba(34, 197, 94, 0.2)",
                                        border: "1px solid rgba(34, 197, 94, 0.3)",
                                    }}
                                >
                                    <FiPlayCircle
                                        className="w-8 h-8 text-green-300"
                                        style={{
                                            filter: `drop-shadow(0 0 12px rgba(34, 197, 94, 0.8))`,
                                        }}
                                    />
                                </div>
                                <div>
                                    <DialogTitle
                                        className="text-2xl font-bold mb-2"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark ? `0 0 20px ${glowColor}80` : `0 0 12px ${primaryColor}50`,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Fluxo Executado com Sucesso!
                                    </DialogTitle>
                                    <DialogDescription
                                        className="text-base"
                                        style={{
                                            color: isDark ? "#d1d5db" : "#6b7280",
                                            textShadow: isDark ? `0 0 8px ${glowColor}40` : "none",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Seu workflow está ativo e funcionando perfeitamente.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="relative z-10 px-6 pb-4">
                            <div
                                className="p-5 rounded-xl flex items-center gap-4"
                                style={{
                                    background: `linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))`,
                                    border: "1px solid rgba(34, 197, 94, 0.3)",
                                    boxShadow: "0 8px 20px rgba(34, 197, 94, 0.2)",
                                }}
                            >
                                <div
                                    className="p-3 rounded-full"
                                    style={{
                                        background: "rgba(34, 197, 94, 0.2)",
                                        boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
                                    }}
                                >
                                    <FiCheckCircle className="w-6 h-6 text-green-400" />
                                </div>
                                <div>
                                    <p
                                        className="text-base font-semibold mb-1"
                                        style={{
                                            color: isDark ? "#86efac" : "#16a34a",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Pronto para Interação
                                    </p>
                                    <p
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#a7f3d0" : "#059669",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Abra o ¥$ Bot para começar a interagir com seu fluxo executado.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 flex justify-end gap-3 p-6 pt-0">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={confirmExecute}
                                className="px-8 py-3 text-sm font-semibold rounded-xl transition-all duration-200"
                                style={{
                                    background: `linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.8))`,
                                    color: "#ffffff",
                                    border: "1px solid rgba(34, 197, 94, 0.6)",
                                    boxShadow: "0 6px 20px rgba(34, 197, 94, 0.4), 0 0 25px rgba(34, 197, 94, 0.2)",
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                <FiCheckCircle className="w-4 h-4" />
                                Perfeito!
                            </motion.button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

const FlowLayout = () => {
    const { theme, setShowColorPanel, showColorPanel, currentGradient, glowEnabled } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [workflowActions, setWorkflowActions] = useState<any>(null)
    const [startPosition, setStartPosition] = useState({ x: 250, y: 100 })
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
    const [componentCount, setComponentCount] = useState(1)
    const [showSidebar, setShowSidebar] = useState(true)
    const [showBot, setShowBot] = useState(false)
    const [flowNodes, setFlowNodes] = useState<any[]>([])
    const [flowEdges, setFlowEdges] = useState<any[]>([])
    const [showAIDialog, setShowAIDialog] = useState(false)
    const workflowContainerRef = useRef<HTMLDivElement>(null)

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

    const handleGenerateWorkflow = useCallback(
        (workflow: any) => {
            console.log("Recebendo workflow gerado pela IA...")
            console.log("Estrutura recebida:", {
                nodes: workflow.nodes?.length || 0,
                edges: workflow.edges?.length || 0,
                hasNodeCounters: !!workflow.nodeCounters,
            })

            if (workflowActions?.loadWorkflow) {
                workflowActions.loadWorkflow(workflow)
            } else {
                console.error("workflowActions.loadWorkflow não está disponível")
            }
        },
        [workflowActions],
    )

    // Handlers for ImageMenu actions
    const handleChangeBackground = useCallback(() => {
        // Changed to useCallback
        console.log("Changing background...")
        const imageUrl = prompt("Enter image URL for background:")
        if (imageUrl) {
            localStorage.setItem("flow-background-image", imageUrl)
            document.documentElement.style.setProperty("--flow-background-image", `url(${imageUrl})`)
        }
    }, [])

    const handleSaveImage = useCallback(async () => {
        // Changed to useCallback
        console.log("Saving image...")
        if (workflowContainerRef.current) {
            try {
                const canvas = await html2canvas(workflowContainerRef.current, {
                    useCORS: true,
                    backgroundColor: null, // Use transparent background
                    allowTaint: true,
                })
                const image = canvas.toDataURL("image/png")
                const link = document.createElement("a")
                link.download = "workflow.png"
                link.href = image
                link.click()
            } catch (error) {
                console.error("Error saving image:", error)
                alert("Failed to save image. Please check browser console for details.")
            }
        }
    }, [])

    const handleResetBackground = useCallback(() => {
        // Changed to useCallback
        console.log("Resetting background...")
        localStorage.removeItem("flow-background-image")
        document.documentElement.style.setProperty("--flow-background-image", "url(/background-pattern.png)") // Reset to default pattern
    }, [])

    useEffect(() => {
        setMounted(true)
        const savedImage = localStorage.getItem("flow-background-image")
        if (savedImage) {
            document.documentElement.style.setProperty("--flow-background-image", `url(${savedImage})`)
        }
    }, [])

    if (!mounted) {
        return (
            <div
                className="flex flex-col items-center justify-center h-screen relative overflow-hidden"
                style={{
                    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)",
                }}
            >
                <div className="absolute inset-0 overflow-hidden">
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.5, 0.3],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "easeInOut",
                        }}
                        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
                        style={{
                            background: "radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)",
                        }}
                    />
                    <motion.div
                        animate={{
                            scale: [1.2, 1, 1.2],
                            opacity: [0.3, 0.5, 0.3],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "easeInOut",
                            delay: 0.5,
                        }}
                        className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
                        style={{
                            background: "radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, transparent 70%)",
                        }}
                    />
                </div>

                <div className="relative z-10 flex flex-col items-center space-y-8">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                            duration: 2,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "linear",
                        }}
                        className="w-16 h-16 rounded-full border-4 border-transparent"
                        style={{
                            borderTopColor: "#a855f7",
                            borderRightColor: "#ec4899",
                            boxShadow: "0 0 30px rgba(168, 85, 247, 0.5)",
                        }}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center space-y-2"
                    >
                        <h2 className="text-2xl font-bold text-white">Workflow Builder</h2>
                        <motion.p
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{
                                duration: 2,
                                repeat: Number.POSITIVE_INFINITY,
                                ease: "easeInOut",
                            }}
                            className="text-sm text-gray-400"
                        >
                            Preparando seu ambiente...
                        </motion.p>
                    </motion.div>
                </div>
            </div>
        )
    }

    return (
        <div className={`flex flex-col h-screen flow-background ${theme === "dark" ? "bg-black" : "bg-gray-50"}`}>
            <FlowElegantSidebar currentGradient={currentGradient} theme={theme} />

            <FlowHeaderWithDialogs
                onZoomIn={workflowActions?.zoomIn}
                onZoomOut={workflowActions?.zoomOut}
                onFitView={workflowActions?.fitView}
                onSave={workflowActions?.save}
                onLoad={workflowActions?.load}
                onExecute={() => {
                    if (workflowActions?.execute) workflowActions.execute()
                    localStorage.setItem("executedFlow", "true")
                }}
                onSearch={workflowActions?.search} // This will now trigger the search in header
                onReset={workflowActions?.reset}
                onDownload={workflowActions?.download}
                onToggleSidebar={toggleSidebar}
                onOpenBot={openBot}
                onOpenColorPanel={() => setShowColorPanel(true)}
                onOpenAIDialog={() => setShowAIDialog(true)}
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

            <AIWorkflowDialog
                open={showAIDialog}
                onOpenChange={setShowAIDialog}
                onWorkflowGenerated={handleGenerateWorkflow}
            />

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
