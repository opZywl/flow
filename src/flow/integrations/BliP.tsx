"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { toast } from "@/components/ui/use-toast"
import {
    FiMessageSquare,
    FiX,
    FiKey,
    FiCheck,
    FiExternalLink,
    FiInfo,
    FiZap,
    FiUpload,
    FiFile,
    FiAlertCircle,
    FiLoader,
    FiCopy,
    FiRefreshCw,
} from "react-icons/fi"
import { BlipAPI, type FlowInfo, type BlipAccount } from "../../lib/blip-api"

interface BlipIntegrationProps {
    isOpen: boolean
    onClose: () => void
    theme: string
    currentGradient: any
}

const BlipIntegration: React.FC<BlipIntegrationProps> = ({ isOpen, onClose, theme, currentGradient }) => {
    const [apiKey, setApiKey] = useState("")
    const [botId, setBotId] = useState("")
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [accountInfo, setAccountInfo] = useState<BlipAccount | null>(null)
    const [flows, setFlows] = useState<FlowInfo[]>([])
    const [isLoadingFlows, setIsLoadingFlows] = useState(false)
    const [webhookUrl, setWebhookUrl] = useState("")

    const isDark = theme === "dark"

    // Gerar URL do webhook automaticamente
    useEffect(() => {
        if (typeof window !== "undefined") {
            setWebhookUrl(`${window.location.origin}/api/webhook/blip`)
        }
    }, [])

    // Verificar se há credenciais salvas
    useEffect(() => {
        const savedApiKey = localStorage.getItem("blip_api_key")
        const savedBotId = localStorage.getItem("blip_bot_id")

        if (savedApiKey && savedBotId) {
            setApiKey(savedApiKey)
            setBotId(savedBotId)
            handleValidateConnection(savedApiKey, savedBotId)
        }
    }, [])

    const handleValidateConnection = useCallback(async (key: string, id: string) => {
        if (!key || !id) return

        setIsConnecting(true)
        try {
            const blipAPI = new BlipAPI(key)
            const result = await blipAPI.validateApiKey()

            if (result.success && result.data) {
                setIsConnected(true)
                setAccountInfo(result.data)
                localStorage.setItem("blip_api_key", key)
                localStorage.setItem("blip_bot_id", id)

                // Carregar fluxos disponíveis
                setIsLoadingFlows(true)
                const flowsResult = await blipAPI.getFlows()
                if (flowsResult.success && flowsResult.data) {
                    setFlows(flowsResult.data)
                }
                setIsLoadingFlows(false)

                toast({
                    title: "✅ Conectado com sucesso!",
                    description: `Conectado como ${result.data.fullName || result.data.email}`,
                })
            } else {
                toast({
                    title: "❌ Credenciais inválidas",
                    description: result.error || "Verifique sua API Key e Bot ID",
                    variant: "destructive",
                })
                localStorage.removeItem("blip_api_key")
                localStorage.removeItem("blip_bot_id")
            }
        } catch (error) {
            toast({
                title: "❌ Erro na conexão",
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive",
            })
        } finally {
            setIsConnecting(false)
        }
    }, [])

    const handleConnect = useCallback(async () => {
        if (!apiKey || !botId) {
            toast({
                title: "❌ Campos obrigatórios",
                description: "Por favor, preencha a API Key e o Bot ID.",
                variant: "destructive",
            })
            return
        }

        await handleValidateConnection(apiKey, botId)
    }, [apiKey, botId, handleValidateConnection])

    const handleDisconnect = useCallback(() => {
        setIsConnected(false)
        setApiKey("")
        setBotId("")
        setAccountInfo(null)
        setFlows([])
        localStorage.removeItem("blip_api_key")
        localStorage.removeItem("blip_bot_id")
        toast({
            title: "🔌 Desconectado",
            description: "Integração com BliP foi removida.",
        })
    }, [])

    const handleRefreshFlows = useCallback(async () => {
        if (!apiKey) return

        setIsLoadingFlows(true)
        try {
            const blipAPI = new BlipAPI(apiKey)
            const result = await blipAPI.getFlows()

            if (result.success && result.data) {
                setFlows(result.data)
                toast({
                    title: "✅ Fluxos atualizados",
                    description: `${result.data.length} fluxos encontrados`,
                })
            } else {
                toast({
                    title: "❌ Erro ao carregar fluxos",
                    description: result.error || "Erro desconhecido",
                    variant: "destructive",
                })
            }
        } catch (error) {
            toast({
                title: "❌ Erro ao carregar fluxos",
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive",
            })
        } finally {
            setIsLoadingFlows(false)
        }
    }, [apiKey])

    const handleImportFlow = useCallback(
        async (flowId: string, flowName: string) => {
            if (!apiKey) return

            try {
                toast({
                    title: "🔄 Importando...",
                    description: `Importando fluxo ${flowName} do BliP...`,
                })

                const blipAPI = new BlipAPI(apiKey)
                const result = await blipAPI.getFlow(flowId)

                if (result.success && result.data) {
                    const convertedFlow = blipAPI.convertFromBlipFormat(result.data)
                    localStorage.setItem("workflow", JSON.stringify(convertedFlow))
                    localStorage.removeItem("executedFlow")
                    window.dispatchEvent(new Event("storage"))

                    toast({
                        title: "✅ Fluxo importado!",
                        description: `${flowName} foi importado com sucesso. ${convertedFlow.nodes?.length || 0} nós criados.`,
                    })
                    onClose()
                } else {
                    toast({
                        title: "❌ Erro na importação",
                        description: result.error || "Erro ao importar fluxo",
                        variant: "destructive",
                    })
                }
            } catch (error) {
                toast({
                    title: "❌ Erro na importação",
                    description: error instanceof Error ? error.message : "Erro desconhecido",
                    variant: "destructive",
                })
            }
        },
        [apiKey, onClose],
    )

    const handleExportFlow = useCallback(async () => {
        if (!apiKey) return

        try {
            const currentFlow = localStorage.getItem("workflow")
            if (!currentFlow) {
                toast({
                    title: "❌ Nenhum fluxo encontrado",
                    description: "Crie um fluxo antes de exportar.",
                    variant: "destructive",
                })
                return
            }

            const flowData = JSON.parse(currentFlow)
            const flowId = `exported-${Date.now()}`

            toast({
                title: "🔄 Exportando...",
                description: "Enviando fluxo para o BliP...",
            })

            const blipAPI = new BlipAPI(apiKey)
            const result = await blipAPI.createOrUpdateFlow(flowId, flowData)

            if (result.success) {
                toast({
                    title: "✅ Fluxo exportado!",
                    description: `Fluxo ${flowData.name || "Sem nome"} foi enviado para o BliP.`,
                })

                // Atualizar lista de fluxos
                await handleRefreshFlows()
            } else {
                toast({
                    title: "❌ Erro na exportação",
                    description: result.error || "Erro ao exportar fluxo",
                    variant: "destructive",
                })
            }
        } catch (error) {
            toast({
                title: "❌ Erro na exportação",
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive",
            })
        }
    }, [apiKey, handleRefreshFlows])

    const handleSetupWebhook = useCallback(async () => {
        if (!apiKey || !webhookUrl) return

        try {
            toast({
                title: "🔄 Configurando webhook...",
                description: "Configurando URL do webhook no BliP...",
            })

            const blipAPI = new BlipAPI(apiKey)
            const result = await blipAPI.setupWebhook(webhookUrl)

            if (result.success) {
                toast({
                    title: "✅ Webhook configurado!",
                    description: "URL do webhook foi configurada no BliP.",
                })
            } else {
                toast({
                    title: "❌ Erro no webhook",
                    description: result.error || "Erro ao configurar webhook",
                    variant: "destructive",
                })
            }
        } catch (error) {
            toast({
                title: "❌ Erro no webhook",
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive",
            })
        }
    }, [apiKey, webhookUrl])

    const copyWebhookUrl = useCallback(() => {
        navigator.clipboard.writeText(webhookUrl)
        toast({
            title: "📋 URL copiada!",
            description: "URL do webhook foi copiada para a área de transferência.",
        })
    }, [webhookUrl])

    if (!isOpen) return null

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />

            {/* Modal */}
            <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, rgba(0,0,0,0.98) 0%, rgba(15,15,15,0.98) 50%, rgba(0,0,0,0.98) 100%)`
                            : `linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 50%, rgba(255,255,255,0.98) 100%)`,
                        border: isDark ? `2px solid #00D4FF60` : `2px solid #00D4FF40`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 60px #00D4FF40, inset 0 1px 0 rgba(255,255,255,0.1)`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 60px #00D4FF30, inset 0 1px 0 rgba(255,255,255,0.8)`,
                        backdropFilter: "blur(25px)",
                    }}
                >
                    {/* Header */}
                    <div
                        className="relative z-10 p-6 border-b"
                        style={{
                            borderColor: isDark ? "#00D4FF40" : "#00D4FF30",
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(15,15,15,0.6))`
                                : `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(248,250,252,0.6))`,
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div
                                    className="p-3 rounded-xl"
                                    style={{
                                        background: `linear-gradient(135deg, #00D4FF, #0099CC)`,
                                        boxShadow: `0 8px 20px #00D4FF40`,
                                    }}
                                >
                                    <FiMessageSquare className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2
                                        className="text-2xl font-bold mb-1"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark ? `0 0 15px #00D4FF60` : `0 0 8px #00D4FF40`,
                                        }}
                                    >
                                        Integração BliP
                                    </h2>
                                    <p
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#e5e7eb" : "#4b5563",
                                        }}
                                    >
                                        Conecte com a API oficial do BliP
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
                                    color: isDark ? "#e5e7eb" : "#4b5563",
                                }}
                            >
                                <FiX className="w-5 h-5" />
                            </motion.button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10 p-6 max-h-[60vh] overflow-y-auto">
                        {!isConnected ? (
                            <div className="space-y-6">
                                {/* Info Card */}
                                <div
                                    className="p-4 rounded-xl border"
                                    style={{
                                        background: isDark ? "rgba(0, 212, 255, 0.1)" : "rgba(0, 212, 255, 0.05)",
                                        borderColor: "#00D4FF40",
                                    }}
                                >
                                    <div className="flex items-start gap-3">
                                        <FiInfo className="w-5 h-5 text-[#00D4FF] mt-0.5" />
                                        <div>
                                            <h3 className="font-semibold text-[#00D4FF] mb-1">Configuração Real da API</h3>
                                            <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                Esta integração usa a API oficial do BliP (http.msging.net)
                                                <br />
                                                1. Acesse o portal do BliP e vá em Configurações
                                                <br />
                                                2. Copie sua API Key e Bot ID
                                                <br />
                                                3. Cole as credenciais aqui para conectar
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Form */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                                            <FiKey className="inline w-4 h-4 mr-2" />
                                            API Key *
                                        </label>
                                        <input
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder="Insira sua API Key do BliP"
                                            className="w-full px-4 py-3 rounded-lg border transition-colors"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                                            <FiMessageSquare className="inline w-4 h-4 mr-2" />
                                            Bot ID *
                                        </label>
                                        <input
                                            type="text"
                                            value={botId}
                                            onChange={(e) => setBotId(e.target.value)}
                                            placeholder="Insira o ID do seu bot"
                                            className="w-full px-4 py-3 rounded-lg border transition-colors"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        />
                                    </div>

                                    <div
                                        className="p-4 rounded-lg border"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <FiExternalLink className="w-4 h-4 text-[#00D4FF]" />
                                            <span className="font-medium" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                        Como obter as credenciais
                      </span>
                                        </div>
                                        <p className="text-sm mb-3" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            1. Acesse o portal do BliP (portal.blip.ai)
                                            <br />
                                            2. Selecione seu bot
                                            <br />
                                            3. Vá em Configurações → Conexões → API Key
                                            <br />
                                            4. Copie a API Key e o Bot ID
                                        </p>
                                        <motion.a
                                            href="https://portal.blip.ai"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            whileHover={{ scale: 1.02 }}
                                            className="inline-flex items-center gap-2 text-sm font-medium text-[#00D4FF] hover:underline"
                                        >
                                            <FiExternalLink className="w-3 h-3" />
                                            Acessar portal do BliP
                                        </motion.a>
                                    </div>
                                </div>

                                {/* Warning */}
                                <div
                                    className="p-4 rounded-xl border"
                                    style={{
                                        background: isDark ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.05)",
                                        borderColor: "#f59e0b40",
                                    }}
                                >
                                    <div className="flex items-start gap-3">
                                        <FiAlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                                        <div>
                                            <h3 className="font-semibold text-yellow-500 mb-1">Importante</h3>
                                            <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                Esta é uma integração real com a API do BliP. Certifique-se de que suas credenciais estão
                                                corretas e que o bot tem as permissões necessárias.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Success Card */}
                                <div
                                    className="p-6 rounded-xl border text-center"
                                    style={{
                                        background: isDark ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.05)",
                                        borderColor: "#10B98140",
                                    }}
                                >
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500 flex items-center justify-center">
                                        <FiCheck className="w-8 h-8 text-white" />
                                    </div>
                                    <h3 className="text-xl font-bold text-green-500 mb-2">Conectado com BliP!</h3>
                                    <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                        Integração ativa com a API oficial do BliP
                                    </p>
                                    {accountInfo && (
                                        <div className="mt-4 text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            <strong>Conta:</strong> {accountInfo.fullName || accountInfo.email}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleExportFlow}
                                        className="p-4 rounded-xl border text-left"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-[#00D4FF]">
                                                <FiUpload className="w-4 h-4 text-white" />
                                            </div>
                                            <span className="font-medium" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                        Exportar para BliP
                      </span>
                                        </div>
                                        <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            Envia o fluxo atual para o BliP como um novo fluxo
                                        </p>
                                    </motion.button>

                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleRefreshFlows}
                                        disabled={isLoadingFlows}
                                        className="p-4 rounded-xl border text-left"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-[#00D4FF]">
                                                {isLoadingFlows ? (
                                                    <FiLoader className="w-4 h-4 text-white animate-spin" />
                                                ) : (
                                                    <FiRefreshCw className="w-4 h-4 text-white" />
                                                )}
                                            </div>
                                            <span className="font-medium" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                        Atualizar Fluxos
                      </span>
                                        </div>
                                        <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            Recarrega a lista de fluxos do BliP
                                        </p>
                                    </motion.button>
                                </div>

                                {/* Webhook Configuration */}
                                <div
                                    className="p-4 rounded-xl border"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    }}
                                >
                                    <h3 className="font-semibold mb-3" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                                        <FiZap className="inline w-4 h-4 mr-2" />
                                        Configuração do Webhook
                                    </h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                            placeholder="URL do webhook"
                                            className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={copyWebhookUrl}
                                            className="px-3 py-2 rounded-lg border"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        >
                                            <FiCopy className="w-4 h-4" />
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleSetupWebhook}
                                            className="px-4 py-2 text-sm font-medium rounded-lg"
                                            style={{
                                                background: "#00D4FF",
                                                color: "white",
                                            }}
                                        >
                                            Configurar
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Flows List */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                                            <FiFile className="inline w-4 h-4 mr-2" />
                                            Fluxos do BliP
                                        </h3>
                                        <span className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                      {flows.length} fluxos
                    </span>
                                    </div>

                                    {isLoadingFlows ? (
                                        <div className="flex items-center justify-center p-8">
                                            <FiLoader className="w-6 h-6 animate-spin text-[#00D4FF]" />
                                        </div>
                                    ) : flows.length > 0 ? (
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {flows.map((flow) => (
                                                <motion.div
                                                    key={flow.id}
                                                    whileHover={{ scale: 1.01 }}
                                                    className="flex items-center justify-between p-3 rounded-lg border"
                                                    style={{
                                                        background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                                        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="p-2 rounded bg-[#00D4FF] flex-shrink-0">
                                                            <FiMessageSquare className="w-3 h-3 text-white" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p
                                                                className="font-medium text-sm truncate"
                                                                style={{ color: isDark ? "#ffffff" : "#111827" }}
                                                            >
                                                                {flow.name}
                                                            </p>
                                                            <p className="text-xs truncate" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                                {flow.description || `ID: ${flow.id}`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleImportFlow(flow.id, flow.name)}
                                                        className="px-3 py-1 text-xs font-medium rounded-lg flex-shrink-0 ml-3"
                                                        style={{
                                                            background: "#00D4FF",
                                                            color: "white",
                                                        }}
                                                    >
                                                        Importar
                                                    </motion.button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div
                                            className="text-center p-8 rounded-lg border"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                color: isDark ? "#d1d5db" : "#6b7280",
                                            }}
                                        >
                                            <FiFile className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p>Nenhum fluxo encontrado</p>
                                            <p className="text-xs mt-1">Crie fluxos no portal do BliP ou clique em "Atualizar Fluxos"</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        className="relative z-10 flex justify-between items-center p-6 border-t"
                        style={{
                            borderColor: isDark ? "#00D4FF40" : "#00D4FF30",
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(15,15,15,0.6))`
                                : `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(248,250,252,0.6))`,
                        }}
                    >
                        <div className="flex items-center gap-2 text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                            <FiZap className="w-4 h-4" />
                            <span>API Oficial BliP</span>
                        </div>
                        <div className="flex gap-3">
                            {isConnected && (
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleDisconnect}
                                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                    style={{
                                        background: "rgba(239, 68, 68, 0.1)",
                                        color: "#ef4444",
                                        border: "1px solid rgba(239, 68, 68, 0.2)",
                                    }}
                                >
                                    Desconectar
                                </motion.button>
                            )}
                            {!isConnected ? (
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleConnect}
                                    disabled={isConnecting}
                                    className="px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                                    style={{
                                        background: isConnecting ? "#00D4FF80" : "#00D4FF",
                                        color: "white",
                                    }}
                                >
                                    {isConnecting ? (
                                        <>
                                            <FiLoader className="w-4 h-4 animate-spin" />
                                            Conectando...
                                        </>
                                    ) : (
                                        "Conectar"
                                    )}
                                </motion.button>
                            ) : (
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onClose}
                                    className="px-6 py-2 text-sm font-medium rounded-lg transition-colors"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        color: isDark ? "#e5e7eb" : "#4b5563",
                                    }}
                                >
                                    Fechar
                                </motion.button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </>
    )
}

export default BlipIntegration