"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { toast } from "@/components/ui/use-toast"
import {
    FiLayers,
    FiX,
    FiKey,
    FiCheck,
    FiExternalLink,
    FiInfo,
    FiZap,
    FiUpload,
    FiAlertCircle,
    FiLoader,
    FiLink,
    FiGithub,
} from "react-icons/fi"
import { FigmaAPI, FigmaOAuth, type FigmaFile, type FigmaUser } from "../../lib/figma-api"

interface FigmaIntegrationProps {
    isOpen: boolean
    onClose: () => void
    theme: string
    currentGradient: any
}

const FigmaIntegration: React.FC<FigmaIntegrationProps> = ({ isOpen, onClose, theme, currentGradient }) => {
    const [accessToken, setAccessToken] = useState("")
    const [fileUrl, setFileUrl] = useState("")
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [userInfo, setUserInfo] = useState<FigmaUser | null>(null)
    const [files, setFiles] = useState<FigmaFile[]>([])
    const [isLoadingFiles, setIsLoadingFiles] = useState(false)
    const [connectionMethod, setConnectionMethod] = useState<"token" | "oauth" | "url">("oauth")

    const isDark = theme === "dark"
    const figmaOAuth = new FigmaOAuth()

    // Verificar se há token salvo
    useEffect(() => {
        const savedToken = localStorage.getItem("figma_access_token")
        if (savedToken) {
            setAccessToken(savedToken)
            handleValidateToken(savedToken)
        }

        // Listener para OAuth callback
        const handleOAuthMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            if (event.data.type === "FIGMA_OAUTH_SUCCESS") {
                const { code, state } = event.data
                if (figmaOAuth.validateState(state)) {
                    handleOAuthCallback(code)
                }
            }
        }

        window.addEventListener("message", handleOAuthMessage)
        return () => window.removeEventListener("message", handleOAuthMessage)
    }, [])

    const handleValidateToken = useCallback(async (token: string) => {
        if (!token) return

        setIsConnecting(true)
        try {
            const figmaAPI = new FigmaAPI(token)
            const result = await figmaAPI.validateToken()

            if (result.success && result.data) {
                setIsConnected(true)
                setUserInfo(result.data)
                localStorage.setItem("figma_access_token", token)

                toast({
                    title: "✅ Conectado com sucesso!",
                    description: `Conectado como ${result.data.handle || result.data.email}`,
                })
            } else {
                toast({
                    title: "❌ Token inválido",
                    description: result.error || "Verifique seu token de acesso",
                    variant: "destructive",
                })
                localStorage.removeItem("figma_access_token")
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

    const handleOAuthLogin = useCallback(() => {
        try {
            figmaOAuth.startOAuthFlow()
            toast({
                title: "🔄 Redirecionando...",
                description: "Você será redirecionado para o Figma para autorizar o acesso.",
            })
        } catch (error) {
            toast({
                title: "❌ Erro no OAuth",
                description: "Não foi possível iniciar o processo de autenticação",
                variant: "destructive",
            })
        }
    }, [])

    const handleOAuthCallback = useCallback(
        async (code: string) => {
            setIsConnecting(true)
            try {
                const result = await figmaOAuth.exchangeCodeForToken(code)

                if (result.success && result.data) {
                    setAccessToken(result.data.access_token)
                    await handleValidateToken(result.data.access_token)
                } else {
                    toast({
                        title: "❌ Erro no OAuth",
                        description: result.error || "Não foi possível obter o token de acesso",
                        variant: "destructive",
                    })
                }
            } catch (error) {
                toast({
                    title: "❌ Erro no OAuth",
                    description: error instanceof Error ? error.message : "Erro desconhecido",
                    variant: "destructive",
                })
            } finally {
                setIsConnecting(false)
            }
        },
        [handleValidateToken],
    )

    const handleTokenConnect = useCallback(async () => {
        if (!accessToken) {
            toast({
                title: "❌ Token obrigatório",
                description: "Por favor, insira seu Personal Access Token do Figma.",
                variant: "destructive",
            })
            return
        }

        await handleValidateToken(accessToken)
    }, [accessToken, handleValidateToken])

    const handleUrlImport = useCallback(async () => {
        if (!fileUrl) {
            toast({
                title: "❌ URL obrigatória",
                description: "Por favor, insira a URL do arquivo do Figma.",
                variant: "destructive",
            })
            return
        }

        const fileKey = FigmaAPI.extractFileKeyFromUrl(fileUrl)
        if (!fileKey) {
            toast({
                title: "❌ URL inválida",
                description: "A URL deve ser um link válido do Figma (figma.com/file/...)",
                variant: "destructive",
            })
            return
        }

        if (!accessToken) {
            toast({
                title: "❌ Token necessário",
                description: "Você precisa estar conectado para importar arquivos.",
                variant: "destructive",
            })
            return
        }

        await handleImportFromFigma(fileKey, "Arquivo da URL")
    }, [fileUrl, accessToken])

    const handleDisconnect = useCallback(() => {
        setIsConnected(false)
        setAccessToken("")
        setUserInfo(null)
        setFiles([])
        localStorage.removeItem("figma_access_token")
        toast({
            title: "🔌 Desconectado",
            description: "Integração com Figma foi removida.",
        })
    }, [])

    const handleImportFromFigma = useCallback(
        async (fileKey: string, fileName: string) => {
            if (!accessToken) return

            try {
                toast({
                    title: "🔄 Importando...",
                    description: `Importando ${fileName} do Figma...`,
                })

                const figmaAPI = new FigmaAPI(accessToken)
                const result = await figmaAPI.getFileByKey(fileKey)

                if (result.success && result.data) {
                    const convertedFlow = figmaAPI.convertFigmaToFlow(result.data)
                    localStorage.setItem("workflow", JSON.stringify(convertedFlow))
                    localStorage.removeItem("executedFlow")
                    window.dispatchEvent(new Event("storage"))

                    toast({
                        title: "✅ Arquivo importado!",
                        description: `${fileName} foi importado com sucesso. ${convertedFlow.nodes?.length || 0} nós criados.`,
                    })
                    onClose()
                } else {
                    toast({
                        title: "❌ Erro na importação",
                        description: result.error || "Erro ao importar arquivo",
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
        [accessToken, onClose],
    )

    const handleExportToFigma = useCallback(async () => {
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
            const figmaAPI = new FigmaAPI(accessToken)
            const figmaFormat = figmaAPI.convertFlowToFigma(flowData)

            // Download do arquivo JSON
            const blob = new Blob([JSON.stringify(figmaFormat, null, 2)], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${flowData.name || "fluxo"}-figma.json`
            a.click()
            URL.revokeObjectURL(url)

            toast({
                title: "✅ Exportação concluída",
                description: "Arquivo JSON baixado. Use um plugin do Figma para importar.",
            })
        } catch (error) {
            toast({
                title: "❌ Erro na exportação",
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive",
            })
        }
    }, [accessToken])

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
                        border: isDark ? `2px solid #F24E1E60` : `2px solid #F24E1E40`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 60px #F24E1E40, inset 0 1px 0 rgba(255,255,255,0.1)`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 60px #F24E1E30, inset 0 1px 0 rgba(255,255,255,0.8)`,
                        backdropFilter: "blur(25px)",
                    }}
                >
                    {/* Header */}
                    <div
                        className="relative z-10 p-6 border-b"
                        style={{
                            borderColor: isDark ? "#F24E1E40" : "#F24E1E30",
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
                                        background: `linear-gradient(135deg, #F24E1E, #FF6B35)`,
                                        boxShadow: `0 8px 20px #F24E1E40`,
                                    }}
                                >
                                    <FiLayers className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2
                                        className="text-2xl font-bold mb-1"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark ? `0 0 15px #F24E1E60` : `0 0 8px #F24E1E40`,
                                        }}
                                    >
                                        Integração Figma
                                    </h2>
                                    <p
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#e5e7eb" : "#4b5563",
                                        }}
                                    >
                                        Conecte com a API oficial do Figma
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
                                {/* Connection Methods */}
                                <div
                                    className="flex gap-2 p-1 rounded-lg"
                                    style={{
                                        background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    }}
                                >
                                    <button
                                        onClick={() => setConnectionMethod("oauth")}
                                        className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                            connectionMethod === "oauth" ? "bg-[#F24E1E] text-white" : ""
                                        }`}
                                        style={{
                                            color: connectionMethod === "oauth" ? "white" : isDark ? "#e5e7eb" : "#4b5563",
                                        }}
                                    >
                                        <FiGithub className="inline w-4 h-4 mr-2" />
                                        Login OAuth
                                    </button>
                                    <button
                                        onClick={() => setConnectionMethod("token")}
                                        className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                            connectionMethod === "token" ? "bg-[#F24E1E] text-white" : ""
                                        }`}
                                        style={{
                                            color: connectionMethod === "token" ? "white" : isDark ? "#e5e7eb" : "#4b5563",
                                        }}
                                    >
                                        <FiKey className="inline w-4 h-4 mr-2" />
                                        Token Manual
                                    </button>
                                    <button
                                        onClick={() => setConnectionMethod("url")}
                                        className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                            connectionMethod === "url" ? "bg-[#F24E1E] text-white" : ""
                                        }`}
                                        style={{
                                            color: connectionMethod === "url" ? "white" : isDark ? "#e5e7eb" : "#4b5563",
                                        }}
                                    >
                                        <FiLink className="inline w-4 h-4 mr-2" />
                                        URL Direta
                                    </button>
                                </div>

                                {/* OAuth Method */}
                                {connectionMethod === "oauth" && (
                                    <div className="space-y-4">
                                        <div
                                            className="p-4 rounded-xl border"
                                            style={{
                                                background: isDark ? "rgba(242, 78, 30, 0.1)" : "rgba(242, 78, 30, 0.05)",
                                                borderColor: "#F24E1E40",
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <FiInfo className="w-5 h-5 text-[#F24E1E] mt-0.5" />
                                                <div>
                                                    <h3 className="font-semibold text-[#F24E1E] mb-1">Login Direto com Figma</h3>
                                                    <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                        Clique no botão abaixo para fazer login diretamente com sua conta Figma. Você será
                                                        redirecionado para autorizar o acesso de forma segura.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleOAuthLogin}
                                            disabled={isConnecting}
                                            className="w-full p-4 rounded-xl border text-center transition-colors flex items-center justify-center gap-3"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                                borderColor: "#F24E1E40",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        >
                                            {isConnecting ? (
                                                <>
                                                    <FiLoader className="w-5 h-5 animate-spin" />
                                                    Conectando...
                                                </>
                                            ) : (
                                                <>
                                                    <FiLayers className="w-5 h-5 text-[#F24E1E]" />
                                                    Entrar com Figma
                                                </>
                                            )}
                                        </motion.button>
                                    </div>
                                )}

                                {/* Token Method */}
                                {connectionMethod === "token" && (
                                    <div className="space-y-4">
                                        <div
                                            className="p-4 rounded-xl border"
                                            style={{
                                                background: isDark ? "rgba(242, 78, 30, 0.1)" : "rgba(242, 78, 30, 0.05)",
                                                borderColor: "#F24E1E40",
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <FiInfo className="w-5 h-5 text-[#F24E1E] mt-0.5" />
                                                <div>
                                                    <h3 className="font-semibold text-[#F24E1E] mb-1">Token Manual</h3>
                                                    <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                        1. Acesse Figma → Settings → Personal Access Tokens
                                                        <br />
                                                        2. Gere um novo token com permissões de leitura
                                                        <br />
                                                        3. Cole o token aqui para conectar
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label
                                                className="block text-sm font-medium mb-2"
                                                style={{ color: isDark ? "#ffffff" : "#111827" }}
                                            >
                                                <FiKey className="inline w-4 h-4 mr-2" />
                                                Personal Access Token *
                                            </label>
                                            <input
                                                type="password"
                                                value={accessToken}
                                                onChange={(e) => setAccessToken(e.target.value)}
                                                placeholder="Insira seu token do Figma (figd_...)"
                                                className="w-full px-4 py-3 rounded-lg border transition-colors"
                                                style={{
                                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                    borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                    color: isDark ? "#ffffff" : "#111827",
                                                }}
                                            />
                                        </div>

                                        <motion.a
                                            href="https://www.figma.com/developers/api#access-tokens"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            whileHover={{ scale: 1.02 }}
                                            className="inline-flex items-center gap-2 text-sm font-medium text-[#F24E1E] hover:underline"
                                        >
                                            <FiExternalLink className="w-3 h-3" />
                                            Como obter o token
                                        </motion.a>
                                    </div>
                                )}

                                {/* URL Method */}
                                {connectionMethod === "url" && (
                                    <div className="space-y-4">
                                        <div
                                            className="p-4 rounded-xl border"
                                            style={{
                                                background: isDark ? "rgba(242, 78, 30, 0.1)" : "rgba(242, 78, 30, 0.05)",
                                                borderColor: "#F24E1E40",
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <FiInfo className="w-5 h-5 text-[#F24E1E] mt-0.5" />
                                                <div>
                                                    <h3 className="font-semibold text-[#F24E1E] mb-1">Importar por URL</h3>
                                                    <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                        Cole a URL de um arquivo público do Figma para importar diretamente. Você ainda precisa de
                                                        um token para acessar a API.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label
                                                className="block text-sm font-medium mb-2"
                                                style={{ color: isDark ? "#ffffff" : "#111827" }}
                                            >
                                                <FiKey className="inline w-4 h-4 mr-2" />
                                                Token de Acesso *
                                            </label>
                                            <input
                                                type="password"
                                                value={accessToken}
                                                onChange={(e) => setAccessToken(e.target.value)}
                                                placeholder="Seu token do Figma"
                                                className="w-full px-4 py-3 rounded-lg border transition-colors mb-4"
                                                style={{
                                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                    borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                    color: isDark ? "#ffffff" : "#111827",
                                                }}
                                            />
                                        </div>

                                        <div>
                                            <label
                                                className="block text-sm font-medium mb-2"
                                                style={{ color: isDark ? "#ffffff" : "#111827" }}
                                            >
                                                <FiLink className="inline w-4 h-4 mr-2" />
                                                URL do Arquivo Figma *
                                            </label>
                                            <input
                                                type="url"
                                                value={fileUrl}
                                                onChange={(e) => setFileUrl(e.target.value)}
                                                placeholder="https://www.figma.com/file/..."
                                                className="w-full px-4 py-3 rounded-lg border transition-colors"
                                                style={{
                                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                    borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                    color: isDark ? "#ffffff" : "#111827",
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

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
                                                Esta é uma integração real com a API do Figma. Certifique-se de que seu token está correto e tem
                                                as permissões necessárias.
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
                                    <h3 className="text-xl font-bold text-green-500 mb-2">Conectado com Figma!</h3>
                                    <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                        Integração ativa com a API oficial do Figma
                                    </p>
                                    {userInfo && (
                                        <div className="mt-4 text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            <strong>Usuário:</strong> {userInfo.handle || userInfo.email}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleExportToFigma}
                                        className="p-4 rounded-xl border text-left"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-[#F24E1E]">
                                                <FiUpload className="w-4 h-4 text-white" />
                                            </div>
                                            <span className="font-medium" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                        Exportar para Figma
                      </span>
                                        </div>
                                        <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                            Converte o fluxo atual para formato Figma (JSON)
                                        </p>
                                    </motion.button>

                                    <div
                                        className="p-4 rounded-xl border"
                                        style={{
                                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-[#F24E1E]">
                                                <FiLink className="w-4 h-4 text-white" />
                                            </div>
                                            <span className="font-medium" style={{ color: isDark ? "#ffffff" : "#111827" }}>
                        Importar por URL
                      </span>
                                        </div>
                                        <input
                                            type="url"
                                            value={fileUrl}
                                            onChange={(e) => setFileUrl(e.target.value)}
                                            placeholder="Cole a URL do arquivo Figma"
                                            className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
                                            style={{
                                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                                color: isDark ? "#ffffff" : "#111827",
                                            }}
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleUrlImport}
                                            className="w-full px-3 py-2 text-sm font-medium rounded-lg"
                                            style={{
                                                background: "#F24E1E",
                                                color: "white",
                                            }}
                                        >
                                            Importar
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div
                                    className="p-4 rounded-xl border"
                                    style={{
                                        background: isDark ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.05)",
                                        borderColor: "#3b82f640",
                                    }}
                                >
                                    <div className="flex items-start gap-3">
                                        <FiInfo className="w-5 h-5 text-blue-500 mt-0.5" />
                                        <div>
                                            <h3 className="font-semibold text-blue-500 mb-1">Limitações da API</h3>
                                            <p className="text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                                                A API do Figma não permite listar arquivos automaticamente em contas gratuitas. Use URLs diretas
                                                de arquivos ou faça upgrade para uma conta Enterprise.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        className="relative z-10 flex justify-between items-center p-6 border-t"
                        style={{
                            borderColor: isDark ? "#F24E1E40" : "#F24E1E30",
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(15,15,15,0.6))`
                                : `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(248,250,252,0.6))`,
                        }}
                    >
                        <div className="flex items-center gap-2 text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                            <FiZap className="w-4 h-4" />
                            <span>API Oficial Figma</span>
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
                                    onClick={
                                        connectionMethod === "token"
                                            ? handleTokenConnect
                                            : connectionMethod === "url"
                                                ? handleUrlImport
                                                : handleOAuthLogin
                                    }
                                    disabled={isConnecting}
                                    className="px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                                    style={{
                                        background: isConnecting ? "#F24E1E80" : "#F24E1E",
                                        color: "white",
                                    }}
                                >
                                    {isConnecting ? (
                                        <>
                                            <FiLoader className="w-4 h-4 animate-spin" />
                                            Conectando...
                                        </>
                                    ) : connectionMethod === "oauth" ? (
                                        "Entrar com Figma"
                                    ) : connectionMethod === "url" ? (
                                        "Importar"
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

export default FigmaIntegration