"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Upload, Loader2, ImageIcon, Type, Download, FileJson, Key, FileCode } from "lucide-react"
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
    const [model, setModel] = useState("gpt-4o")
    const [apiKey, setApiKey] = useState("")
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [additionalContext, setAdditionalContext] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState("text")
    const [generatedWorkflow, setGeneratedWorkflow] = useState<any>(null)
    const [lastPrompt, setLastPrompt] = useState<string>("")

    const isDark = theme === "dark"

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

        toast({
            title: "Construindo workflow...",
            description: "A IA está gerando seu workflow. Isso pode levar alguns segundos.",
        })

        try {
            const payload: any = {
                description: activeTab === "text" ? description : "Recrie o workflow baseado na imagem fornecida",
                size,
                model,
                apiKey,
                additionalContext: activeTab === "image" ? additionalContext : undefined,
                imageUrl: activeTab === "image" ? imagePreview : undefined,
            }

            const response = await fetch("/api/generate-workflow", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            })

            const data = await response.json()

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Erro ao gerar workflow")
            }

            toast({
                title: "Workflow gerado com sucesso!",
                description: `${data.workflow.nodes.length} nós criados`,
            })

            setGeneratedWorkflow(data.workflow)
            setLastPrompt(data.prompt || "")
        } catch (error: any) {
            console.error("[v0] Erro:", error)
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

        onWorkflowGenerated(generatedWorkflow)
        onOpenChange(false)

        // Limpar formulário
        setDescription("")
        setImageFile(null)
        setImagePreview(null)
        setAdditionalContext("")
        setSize("medium")
        setModel("gpt-4o")
        setGeneratedWorkflow(null)
        setLastPrompt("")

        toast({
            title: "Workflow importado!",
            description: "O workflow foi carregado no canvas",
        })
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
                return "3-30 nós - Personalizado conforme necessidade"
            default:
                return ""
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`max-w-2xl max-h-[90vh] overflow-y-auto ${
                    isDark
                        ? "bg-black/95 border border-gray-800/50 backdrop-blur-md"
                        : "bg-white border border-gray-200 backdrop-blur-md"
                }`}
            >
                <DialogHeader className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <DialogTitle
                            className={`text-xl font-bold ${
                                isDark
                                    ? "text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400"
                                    : "text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-cyan-600"
                            }`}
                        >
                            Criar Workflow com IA
                        </DialogTitle>
                    </div>
                    <DialogDescription className={isDark ? "text-gray-400" : "text-gray-600"}>
                        Descreva o workflow que deseja criar ou faça upload de uma imagem de referência
                    </DialogDescription>
                </DialogHeader>

                {generatedWorkflow ? (
                    <div className="space-y-4">
                        <div
                            className={`p-6 rounded-lg border-2 ${
                                isDark
                                    ? "bg-gradient-to-br from-gray-900 to-gray-800 border-green-500/30"
                                    : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-500/30"
                            }`}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 rounded-lg bg-green-500">
                                    <Sparkles className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h3 className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                                        Workflow Gerado com Sucesso!
                                    </h3>
                                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                        {generatedWorkflow.nodes.length} nós criados
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <Button
                                        onClick={handleImport}
                                        className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                                    >
                                        <FileJson className="h-4 w-4 mr-2" />
                                        Importar Direto
                                    </Button>
                                    <Button
                                        onClick={handleDownload}
                                        variant="outline"
                                        className={`flex-1 ${
                                            isDark
                                                ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                                                : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                        }`}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download JSON
                                    </Button>
                                </div>
                                <Button
                                    onClick={handleDownloadPrompt}
                                    variant="outline"
                                    className={`w-full ${
                                        isDark
                                            ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                                            : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                    }`}
                                >
                                    <FileCode className="h-4 w-4 mr-2" />
                                    Download Prompt Completo
                                </Button>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            onClick={() => setGeneratedWorkflow(null)}
                            className={`w-full ${isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                        >
                            Gerar Novo Workflow
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="apiKey" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4" />
                                    Chave da API OpenAI
                                </div>
                            </Label>
                            <Input
                                id="apiKey"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-proj-..."
                                className={`${
                                    isDark
                                        ? "bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                                        : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                                }`}
                                disabled={isGenerating}
                            />
                            <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                Sua chave não será armazenada e é usada apenas para esta requisição
                            </p>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList
                                className={`grid w-full grid-cols-2 mb-4 ${
                                    isDark ? "bg-gray-900 border border-gray-800" : "bg-gray-100 border border-gray-200"
                                }`}
                            >
                                <TabsTrigger
                                    value="text"
                                    className={`flex items-center gap-2 ${
                                        isDark
                                            ? "data-[state=active]:bg-gray-800 data-[state=active]:text-white"
                                            : "data-[state=active]:bg-white data-[state=active]:text-gray-900"
                                    }`}
                                >
                                    <Type className="h-4 w-4" />
                                    Descrição em Texto
                                </TabsTrigger>
                                <TabsTrigger
                                    value="image"
                                    className={`flex items-center gap-2 ${
                                        isDark
                                            ? "data-[state=active]:bg-gray-800 data-[state=active]:text-white"
                                            : "data-[state=active]:bg-white data-[state=active]:text-gray-900"
                                    }`}
                                >
                                    <ImageIcon className="h-4 w-4" />
                                    Baseado em Imagem
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="text" className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="description" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                        Descreva o workflow
                                    </Label>
                                    <Textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Ex: hospital - criar um fluxo de atendimento para agendamento de consultas"
                                        className={`min-h-[120px] ${
                                            isDark
                                                ? "bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                                                : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                                        }`}
                                        disabled={isGenerating}
                                    />
                                    <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                        Seja específico sobre o que o workflow deve fazer
                                    </p>
                                </div>
                            </TabsContent>

                            <TabsContent value="image" className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="image" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                        Upload de Imagem do Workflow
                                    </Label>
                                    <div
                                        className={`border-2 border-dashed rounded-lg p-6 text-center ${
                                            isDark ? "border-gray-700 bg-gray-900" : "border-gray-300 bg-gray-50"
                                        }`}
                                    >
                                        {imagePreview ? (
                                            <div className="space-y-3">
                                                <img
                                                    src={imagePreview || "/placeholder.svg"}
                                                    alt="Preview"
                                                    className="max-h-48 mx-auto rounded-lg"
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
                                                            ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                                                            : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                                    }
                                                >
                                                    Remover Imagem
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <Upload className={`h-12 w-12 mx-auto ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                                                <div>
                                                    <Label
                                                        htmlFor="image-upload"
                                                        className={`cursor-pointer text-sm font-medium ${
                                                            isDark ? "text-purple-400" : "text-purple-600"
                                                        } hover:underline`}
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
                                                </div>
                                                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                                    PNG, JPG ou JPEG até 10MB
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="context" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                        Contexto Adicional (Opcional)
                                    </Label>
                                    <Textarea
                                        id="context"
                                        value={additionalContext}
                                        onChange={(e) => setAdditionalContext(e.target.value)}
                                        placeholder="Adicione detalhes sobre o workflow da imagem..."
                                        className={`min-h-[80px] ${
                                            isDark
                                                ? "bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                                                : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                                        }`}
                                        disabled={isGenerating}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>

                        <div className="space-y-2">
                            <Label htmlFor="model" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                Modelo GPT
                            </Label>
                            <Select value={model} onValueChange={setModel} disabled={isGenerating}>
                                <SelectTrigger
                                    id="model"
                                    className={
                                        isDark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"
                                    }
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
                            <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                Modelos mais avançados geram workflows mais precisos
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="size" className={isDark ? "text-gray-200" : "text-gray-700"}>
                                Tamanho do Workflow
                            </Label>
                            <Select value={size} onValueChange={setSize} disabled={isGenerating}>
                                <SelectTrigger
                                    id="size"
                                    className={
                                        isDark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"
                                    }
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="small">Pequeno</SelectItem>
                                    <SelectItem value="medium">Médio</SelectItem>
                                    <SelectItem value="large">Grande</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>{getSizeDescription(size)}</p>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isGenerating}
                                className={
                                    isDark
                                        ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                                        : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                }
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Construindo...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Gerar Workflow
                                    </>
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
