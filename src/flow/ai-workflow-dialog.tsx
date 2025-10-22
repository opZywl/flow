"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Sparkles,
    Upload,
    Loader2,
    ImageIcon,
    Type,
    Download,
    FileJson,
    Key,
    FileCode,
    CheckCircle2,
    AlertCircle,
} from "lucide-react"
import { useTheme } from "../ThemeContext"
import { toast } from "@/components/ui/use-toast"

interface AIWorkflowDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onWorkflowGenerated: (workflow: any) => void
}

export default function AIWorkflowDialog({ open, onOpenChange, onWorkflowGenerated }: AIWorkflowDialogProps) {
    const { theme } = useTheme()
    const [description, setDescription] = useState("")
    const [size, setSize] = useState("medium")
    const [customNodeCount, setCustomNodeCount] = useState(10)
    const [model, setModel] = useState("gpt-4o")
    const [apiKey, setApiKey] = useState("")
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [additionalContext, setAdditionalContext] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState("text")
    const [generatedWorkflow, setGeneratedWorkflow] = useState<any>(null)
    const [lastPrompt, setLastPrompt] = useState<string>("")
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const successMessageRef = useRef<HTMLDivElement>(null)

    const isDark = theme === "dark"

    useEffect(() => {
        if (generatedWorkflow && successMessageRef.current) {
            successMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }, [generatedWorkflow])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setImageFile(file)
            const reader = new FileReader()
            reader.onloadend = () => {
                setImagePreview(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleGenerate = async () => {
        if (!apiKey.trim()) {
            toast({
                title: "API Key necessária",
                description: "Por favor, insira sua chave da OpenAI.",
                variant: "destructive",
            })
            return
        }

        if (activeTab === "text" && !description.trim()) {
            toast({
                title: "Descrição necessária",
                description: "Por favor, descreva o workflow que deseja criar.",
                variant: "destructive",
            })
            return
        }

        if (activeTab === "image" && !imageFile && !imagePreview) {
            toast({
                title: "Imagem necessária",
                description: "Por favor, faça upload de uma imagem do workflow.",
                variant: "destructive",
            })
            return
        }

        setIsGenerating(true)
        setValidationErrors([])

        toast({
            title: "Construindo workflow...",
            description: "A IA está gerando seu workflow. Isso pode levar alguns segundos.",
        })

        try {
            const payload: any = {
                description: activeTab === "text" ? description : "Recrie o workflow baseado na imagem fornecida",
                size,
                customNodeCount: size === "custom" ? customNodeCount : undefined,
                model,
                apiKey,
                additionalContext: activeTab === "image" ? additionalContext : undefined,
                imageUrl: activeTab === "image" ? imagePreview : undefined,
            }

            console.log("Enviando requisição para gerar workflow...")

            const response = await fetch("/api/generate-workflow", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            })

            const data = await response.json()

            console.log("Resposta recebida:", data)

            if (!response.ok || !data.success) {
                if (data.validationErrors && Array.isArray(data.validationErrors)) {
                    setValidationErrors(data.validationErrors)
                    throw new Error(`Erros de validação encontrados:\n${data.validationErrors.join("\n")}`)
                }
                throw new Error(data.error || data.details || "Erro ao gerar workflow")
            }

            if (!data.workflow || !data.workflow.nodes || !data.workflow.edges) {
                throw new Error("Workflow gerado está incompleto ou inválido")
            }

            const invalidEdges = data.workflow.edges.filter((edge: any) => !edge.type || edge.type !== "custom")
            if (invalidEdges.length > 0) {
                console.error("Edges inválidas encontradas:", invalidEdges)
                throw new Error(`${invalidEdges.length} conexão(ões) sem o tipo "custom" correto`)
            }

            console.log("Workflow validado com sucesso!")

            toast({
                title: "Workflow gerado com sucesso!",
                description: `${data.workflow.nodes.length} nós e ${data.workflow.edges.length} conexões criadas`,
            })

            setGeneratedWorkflow(data.workflow)
            setLastPrompt(data.prompt || "")
        } catch (error: any) {
            console.error("Erro:", error)
            toast({
                title: "Erro ao gerar workflow",
                description: error.message || "Tente novamente mais tarde",
                variant: "destructive",
            })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleDownload = () => {
        if (!generatedWorkflow) return

        const dataStr = JSON.stringify(generatedWorkflow, null, 2)
        const dataBlob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement("a")
        link.href = url
        link.download = `workflow-ai-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)

        toast({
            title: "Download iniciado",
            description: "Workflow salvo com sucesso!",
        })
    }

    const handleDownloadPrompt = () => {
        if (!lastPrompt || !generatedWorkflow) return

        const promptData = {
            prompt: lastPrompt,
            workflow: generatedWorkflow,
            metadata: {
                model,
                size,
                description: activeTab === "text" ? description : "Baseado em imagem",
                generatedAt: new Date().toISOString(),
            },
        }

        const dataStr = JSON.stringify(promptData, null, 2)
        const dataBlob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement("a")
        link.href = url
        link.download = `workflow-prompt-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)

        toast({
            title: "Prompt baixado",
            description: "Prompt e workflow salvos com sucesso!",
        })
    }

    const handleImport = () => {
        if (!generatedWorkflow) return

        try {
            console.log("Validando workflow antes de importar...")

            if (!generatedWorkflow.nodes || !Array.isArray(generatedWorkflow.nodes)) {
                throw new Error("Workflow não possui array de nós válido")
            }

            if (!generatedWorkflow.edges || !Array.isArray(generatedWorkflow.edges)) {
                throw new Error("Workflow não possui array de edges válido")
            }

            const startNode = generatedWorkflow.nodes.find((n: any) => n.type === "start" || n.id === "start-node")
            if (!startNode) {
                throw new Error("Workflow não possui nó de início (start)")
            }

            if (startNode.id !== "start-node") {
                throw new Error(`Nó start deve ter id "start-node", mas tem "${startNode.id}"`)
            }

            for (let i = 0; i < generatedWorkflow.nodes.length; i++) {
                const node = generatedWorkflow.nodes[i]

                if (!node.id || typeof node.id !== "string") {
                    throw new Error(`Nó ${i} não tem ID válido`)
                }

                if (!node.type || typeof node.type !== "string") {
                    throw new Error(`Nó ${i} (${node.id}) não tem tipo válido`)
                }

                if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
                    throw new Error(`Nó ${i} (${node.id}) não tem posição válida`)
                }

                if (!node.data || typeof node.data !== "object") {
                    throw new Error(`Nó ${i} (${node.id}) não tem data válido`)
                }

                if (node.type === "sendMessage") {
                    if (!node.data.message || typeof node.data.message !== "string" || !node.data.message.trim()) {
                        throw new Error(`Nó ${node.id} (sendMessage) não tem mensagem válida`)
                    }
                }

                if (node.type === "options") {
                    if (!node.data.message || typeof node.data.message !== "string" || !node.data.message.trim()) {
                        throw new Error(`Nó ${node.id} (options) não tem mensagem válida`)
                    }
                    if (!node.data.options || !Array.isArray(node.data.options) || node.data.options.length === 0) {
                        throw new Error(`Nó ${node.id} (options) não tem opções válidas`)
                    }
                }
            }

            const nodeIds = new Set(generatedWorkflow.nodes.map((n: any) => String(n.id)))
            const connectedToStart = new Set<string>(["start-node"])
            const queue = ["start-node"]

            while (queue.length > 0) {
                const currentId = queue.shift()!
                const outgoingEdges = generatedWorkflow.edges.filter((e: any) => e.source === currentId)

                for (const edge of outgoingEdges) {
                    if (!connectedToStart.has(edge.target)) {
                        connectedToStart.add(edge.target)
                        queue.push(edge.target)
                    }
                }
            }

            const disconnectedNodes = Array.from(nodeIds) as string[]
            const filteredDisconnectedNodes = disconnectedNodes.filter((id: string) => !connectedToStart.has(id))

            if (filteredDisconnectedNodes.length > 0) {
                const disconnectedLabels = filteredDisconnectedNodes.map((id: string) => {
                    const node = generatedWorkflow.nodes.find((n: any) => String(n.id) === id)
                    return String(node?.data?.customId || node?.data?.label || id)
                })
                throw new Error(`Nós desconectados do início: ${disconnectedLabels.join(", ")}`)
            }

            console.log("Workflow validado com sucesso!")
            console.log("Nós:", generatedWorkflow.nodes.length)
            console.log("Edges:", generatedWorkflow.edges.length)
            console.log("Todos os nós conectados ao start")
            console.log("Todas as edges com type 'custom'")

            onWorkflowGenerated(generatedWorkflow)
            onOpenChange(false)

            setDescription("")
            setImageFile(null)
            setImagePreview(null)
            setAdditionalContext("")
            setSize("medium")
            setModel("gpt-4o")
            setGeneratedWorkflow(null)
            setLastPrompt("")
            setValidationErrors([])

            toast({
                title: "Workflow importado!",
                description: "O workflow foi carregado no canvas com sucesso. Clique em Salvar e depois Executar.",
            })
        } catch (error: any) {
            console.error("Erro ao importar:", error)
            toast({
                title: "Erro ao importar workflow",
                description: error.message,
                variant: "destructive",
            })
        }
    }

    const getSizeDescription = (size: string) => {
        switch (size) {
            case "small":
                return "3-5 nós - Ideal para fluxos simples e diretos"
            case "medium":
                return "6-10 nós - Equilibrado para a maioria dos casos"
            case "large":
                return "11-20 nós - Workflows complexos e detalhados"
            case "custom":
                return `${customNodeCount} nós - Personalizado conforme necessidade`
            default:
                return ""
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`max-w-3xl max-h-[90vh] overflow-hidden p-0 ${
                    isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                }`}
            >
                <DialogHeader className={`px-6 pt-6 pb-4 border-b ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                    <div className="flex items-start gap-4">
                        <div
                            className={`p-3 rounded-xl ${isDark ? "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20" : "bg-gradient-to-br from-violet-100 to-fuchsia-100"}`}
                        >
                            <Sparkles className={`h-6 w-6 ${isDark ? "text-violet-400" : "text-violet-600"}`} />
                        </div>
                        <div className="flex-1">
                            <DialogTitle className={`text-2xl font-semibold mb-1 ${isDark ? "text-zinc-50" : "text-zinc-900"}`}>
                                Criar Fluxograma com IA
                            </DialogTitle>
                            <DialogDescription className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                                Descreva o fluxograma que deseja criar ou faça upload de uma imagem de referência
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="overflow-y-auto max-h-[calc(90vh-140px)] px-6 py-4">
                    {validationErrors.length > 0 && (
                        <div
                            className={`mb-4 p-4 rounded-lg border ${
                                isDark ? "bg-red-950/30 border-red-900/50" : "bg-red-50 border-red-200"
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`} />
                                <div className="flex-1">
                                    <h4 className={`font-semibold mb-2 ${isDark ? "text-red-400" : "text-red-700"}`}>
                                        Erros de Validação Encontrados
                                    </h4>
                                    <ul className={`text-sm space-y-1 ${isDark ? "text-red-300" : "text-red-600"}`}>
                                        {validationErrors.map((error, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <span className="mt-1">•</span>
                                                <span>{error}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {generatedWorkflow ? (
                        <div className="space-y-4" ref={successMessageRef}>
                            <div
                                className={`p-6 rounded-xl border ${
                                    isDark
                                        ? "bg-gradient-to-br from-emerald-950/30 to-teal-950/30 border-emerald-900/50"
                                        : "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200"
                                }`}
                            >
                                <div className="flex items-start gap-4 mb-6">
                                    <div className={`p-2.5 rounded-lg ${isDark ? "bg-emerald-500/20" : "bg-emerald-500"}`}>
                                        <CheckCircle2 className={`h-6 w-6 ${isDark ? "text-emerald-400" : "text-white"}`} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`text-lg font-semibold mb-1 ${isDark ? "text-zinc-50" : "text-zinc-900"}`}>
                                            Workflow Gerado com Sucesso
                                        </h3>
                                        <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                                            {generatedWorkflow.nodes.length} nós e {generatedWorkflow.edges.length} conexões criadas
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    <Button
                                        onClick={handleImport}
                                        className={`w-full h-11 font-medium ${
                                            isDark
                                                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white"
                                                : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white"
                                        }`}
                                    >
                                        <FileJson className="h-4 w-4 mr-2" />
                                        Importar para o Canvas
                                    </Button>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Button
                                            onClick={handleDownload}
                                            variant="outline"
                                            className={`h-10 ${
                                                isDark
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                                                    : "bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                                            }`}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download JSON
                                        </Button>
                                        <Button
                                            onClick={handleDownloadPrompt}
                                            variant="outline"
                                            className={`h-10 ${
                                                isDark
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                                                    : "bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                                            }`}
                                        >
                                            <FileCode className="h-4 w-4 mr-2" />
                                            Prompt Completo
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setGeneratedWorkflow(null)
                                    setValidationErrors([])
                                }}
                                className={`w-full ${isDark ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"}`}
                            >
                                Gerar Novo Workflow
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <Label
                                    htmlFor="apiKey"
                                    className={`text-sm font-medium flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}
                                >
                                    <Key className="h-4 w-4" />
                                    Chave da API OpenAI
                                </Label>
                                <Input
                                    id="apiKey"
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-proj-..."
                                    className={`h-10 ${
                                        isDark
                                            ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
                                            : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500"
                                    }`}
                                    disabled={isGenerating}
                                />
                                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                    Sua chave não será armazenada e é usada apenas para esta requisição
                                </p>
                            </div>

                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList
                                    className={`grid w-full grid-cols-2 h-11 p-1 ${
                                        isDark ? "bg-zinc-900 border border-zinc-800" : "bg-zinc-100 border border-zinc-200"
                                    }`}
                                >
                                    <TabsTrigger
                                        value="text"
                                        className={`flex items-center gap-2 rounded-md ${
                                            isDark
                                                ? "data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50"
                                                : "data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
                                        }`}
                                    >
                                        <Type className="h-4 w-4" />
                                        Descrição em Texto
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="image"
                                        className={`flex items-center gap-2 rounded-md ${
                                            isDark
                                                ? "data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50"
                                                : "data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
                                        }`}
                                    >
                                        <ImageIcon className="h-4 w-4" />
                                        Baseado em Imagem
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="text" className="space-y-4 mt-4">
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="description"
                                            className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}
                                        >
                                            Descreva o workflow
                                        </Label>
                                        <Textarea
                                            id="description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Ex: hospital - criar um fluxo de atendimento para agendamento de consultas"
                                            className={`min-h-[120px] resize-none ${
                                                isDark
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
                                                    : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500"
                                            }`}
                                            disabled={isGenerating}
                                        />
                                        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                            Seja específico sobre o que o workflow deve fazer
                                        </p>
                                    </div>
                                </TabsContent>

                                <TabsContent value="image" className="space-y-4 mt-4">
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="image"
                                            className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}
                                        >
                                            Upload de Imagem do Workflow
                                        </Label>
                                        <div
                                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                                                isDark
                                                    ? "border-zinc-700 bg-zinc-900/50 hover:border-zinc-600"
                                                    : "border-zinc-300 bg-zinc-50 hover:border-zinc-400"
                                            }`}
                                        >
                                            {imagePreview ? (
                                                <div className="space-y-4">
                                                    <img
                                                        src={imagePreview || "/placeholder.svg"}
                                                        alt="Preview"
                                                        className="max-h-48 mx-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setImageFile(null)
                                                            setImagePreview(null)
                                                        }}
                                                        disabled={isGenerating}
                                                        className={
                                                            isDark
                                                                ? "bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700"
                                                                : "bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                                                        }
                                                    >
                                                        Remover Imagem
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div
                                                        className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                                                            isDark ? "bg-zinc-800" : "bg-zinc-200"
                                                        }`}
                                                    >
                                                        <Upload className={`h-8 w-8 ${isDark ? "text-zinc-400" : "text-zinc-500"}`} />
                                                    </div>
                                                    <div>
                                                        <Label
                                                            htmlFor="image-upload"
                                                            className={`cursor-pointer text-sm font-medium ${
                                                                isDark
                                                                    ? "text-violet-400 hover:text-violet-300"
                                                                    : "text-violet-600 hover:text-violet-700"
                                                            }`}
                                                        >
                                                            Clique para fazer upload
                                                        </Label>
                                                        <Input
                                                            id="image-upload"
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleImageUpload}
                                                            className="hidden"
                                                            disabled={isGenerating}
                                                        />
                                                        <p className={`text-xs mt-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                                            PNG, JPG ou JPEG até 10MB
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="context"
                                            className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}
                                        >
                                            Contexto Adicional (Opcional)
                                        </Label>
                                        <Textarea
                                            id="context"
                                            value={additionalContext}
                                            onChange={(e) => setAdditionalContext(e.target.value)}
                                            placeholder="Adicione detalhes sobre o workflow da imagem..."
                                            className={`min-h-[80px] resize-none ${
                                                isDark
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
                                                    : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500"
                                            }`}
                                            disabled={isGenerating}
                                        />
                                    </div>
                                </TabsContent>
                            </Tabs>

                            <div className="space-y-2">
                                <Label htmlFor="model" className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                                    Modelo GPT
                                </Label>
                                <Select value={model} onValueChange={setModel} disabled={isGenerating}>
                                    <SelectTrigger
                                        id="model"
                                        className={`h-10 ${
                                            isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-zinc-300 text-zinc-900"
                                        }`}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gpt-4o">GPT-4o (Recomendado)</SelectItem>
                                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido)</SelectItem>
                                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Econômico)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                    Modelos mais avançados geram workflows mais precisos
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="size" className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                                    Tamanho do Workflow
                                </Label>
                                <Select value={size} onValueChange={setSize} disabled={isGenerating}>
                                    <SelectTrigger
                                        id="size"
                                        className={`h-10 ${
                                            isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-zinc-300 text-zinc-900"
                                        }`}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="small">Pequeno (3-5 nós)</SelectItem>
                                        <SelectItem value="medium">Médio (6-10 nós)</SelectItem>
                                        <SelectItem value="large">Grande (11-20 nós)</SelectItem>
                                        <SelectItem value="custom">Personalizado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{getSizeDescription(size)}</p>

                                {size === "custom" && (
                                    <div className="mt-3 space-y-2">
                                        <Label
                                            htmlFor="customNodeCount"
                                            className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}
                                        >
                                            Quantidade Exata de Nós (3-30)
                                        </Label>
                                        <Input
                                            id="customNodeCount"
                                            type="number"
                                            min={3}
                                            max={30}
                                            value={customNodeCount}
                                            onChange={(e) => {
                                                const value = Number.parseInt(e.target.value)
                                                if (!isNaN(value) && value >= 3 && value <= 30) {
                                                    setCustomNodeCount(value)
                                                }
                                            }}
                                            className={`h-10 ${
                                                isDark
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                                                    : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                                            }`}
                                            disabled={isGenerating}
                                        />
                                        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                            A IA gerará EXATAMENTE {customNodeCount} nós para seu workflow personalizado
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {!generatedWorkflow && (
                    <div
                        className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-zinc-50"}`}
                    >
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isGenerating}
                            className={`h-10 px-4 ${
                                isDark
                                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                                    : "bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                            }`}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className={`h-10 px-6 font-medium ${
                                isDark
                                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white"
                                    : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white"
                            }`}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Construindo...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Iniciar
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
