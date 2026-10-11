"use client"

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { START_TYPE, getComponentColor, getComponentLabel } from "@/lib/atendimento/catalog"
import { downloadJson, downloadText } from "@/lib/atendimento/download"
import { exportFileName, exportFlow, importFlow, optionIndices, stampExport } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { ui } from "./ui"

type Source = "text" | "image"
type Size = "small" | "medium" | "large" | "custom"
type Field = "description" | "image" | "model" | "count" | "apiKey"
type FieldErrors = Partial<Record<Field, string>>

interface ReferenceImage {
  name: string
  size: number
  dataUrl: string
}

interface Failure {
  title: string
  details?: string
  items: string[]
}

interface Generation {
  flow: AtendimentoFlow
  prompt: string
  model: string
  sizeLabel: string
  source: Source
  description: string
  context: string
  generatedAt: string
}

interface GenerateResponse {
  success?: unknown
  workflow?: unknown
  prompt?: unknown
  error?: unknown
  details?: unknown
  validationErrors?: unknown
}

interface AIWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkflowGenerated: (workflow: AtendimentoFlow) => boolean
}

const MODELS = [
  { value: "gpt-4o", name: "GPT-4o", note: "recomendado", hint: "Mais preciso em fluxos com várias ramificações.", vision: true },
  { value: "gpt-4o-mini", name: "GPT-4o mini", note: "mais rápido", hint: "Rápido e econômico, indicado para fluxos simples.", vision: true },
  { value: "gpt-4-turbo", name: "GPT-4 Turbo", note: "", hint: "Alternativa compatível com imagens de referência.", vision: true },
  { value: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", note: "econômico", hint: "O mais econômico. Não analisa imagens.", vision: false },
]

const SIZES: Array<{ value: Size; label: string; hint: string }> = [
  { value: "small", label: "Pequeno (3 a 5 componentes)", hint: "Para fluxos simples e diretos." },
  { value: "medium", label: "Médio (6 a 10 componentes)", hint: "Equilibrado para a maioria dos atendimentos." },
  { value: "large", label: "Grande (11 a 20 componentes)", hint: "Para atendimentos com várias ramificações." },
  { value: "custom", label: "Personalizado", hint: "A IA gera exatamente a quantidade informada." },
]

const FIELD_ORDER: Field[] = ["description", "image", "model", "count", "apiKey"]
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MIN_COUNT = 3
const MAX_COUNT = 30

const fieldBase = "block disabled:cursor-not-allowed disabled:opacity-60"
const invalidField =
  "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"
const tabTrigger =
  "gap-1.5 whitespace-normal rounded-md px-3 py-1.5 text-center text-xs font-semibold leading-4 text-flow-muted-strong transition focus-visible:ring-2 focus-visible:ring-flow-accent/30 focus-visible:ring-offset-0 data-[state=active]:bg-flow-accent data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-flow-surface data-[state=inactive]:hover:text-flow-fg"

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function modelName(value: string): string {
  return MODELS.find((entry) => entry.value === value)?.name ?? value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

function messageLines(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Leitura vazia.")))
    reader.onerror = () => reject(reader.error ?? new Error("Falha na leitura."))
    reader.readAsDataURL(file)
  })
}

function nodeSummary(node: AtendimentoNode): string {
  const data = node.data.data
  if (node.data.type === START_TYPE) return "Início do atendimento"
  if (node.data.type === "envio_pergunta") return text(data.template)
  if (node.data.type === "envio_mensagem") {
    return [text(data.title), plural(optionIndices(data).length, "opção", "opções")].filter(Boolean).join(" · ")
  }
  if (node.data.type === "finalizar") return "Encerra a conversa"
  return ""
}

function nodeColor(node: AtendimentoNode): string {
  return node.data.type === START_TYPE ? "rgb(var(--flow-success))" : getComponentColor(node.data.type)
}

function orderedNodes(flow: AtendimentoFlow): AtendimentoNode[] {
  return [...flow.nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
}

function codeFence(content: string): string {
  const longest = Math.max(0, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(Math.max(3, longest + 1))
}

export default function AIWorkflowDialog({ open, onOpenChange, onWorkflowGenerated }: AIWorkflowDialogProps) {
  const baseId = useId()
  const [source, setSource] = useState<Source>("text")
  const [description, setDescription] = useState("")
  const [image, setImage] = useState<ReferenceImage | null>(null)
  const [context, setContext] = useState("")
  const [model, setModel] = useState(MODELS[0].value)
  const [size, setSize] = useState<Size>("medium")
  const [count, setCount] = useState("10")
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<Generation | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resetOnCloseRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)

  const idFor = (key: string) => `${baseId}-${key}`
  const describedBy = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined
  const currentModel = MODELS.find((entry) => entry.value === model) ?? MODELS[0]
  const currentSize = SIZES.find((entry) => entry.value === size) ?? SIZES[1]
  const previewNodes = useMemo(() => (result ? orderedNodes(result.flow) : []), [result])

  useEffect(() => {
    if (!open) return
    return () => abortRef.current?.abort()
  }, [open])

  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView({ block: "nearest" })
  }, [failure])

  useEffect(() => {
    if (!result) return
    bodyRef.current?.scrollTo({ top: 0 })
    importRef.current?.focus()
  }, [result])

  const clearFieldError = (field: Field) =>
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const focusLater = (key: string) => window.requestAnimationFrame(() => document.getElementById(idFor(key))?.focus())

  const changeSource = (value: string) => {
    if (value !== "text" && value !== "image") return
    setSource(value)
    setFieldErrors((current) => ({ ...current, description: undefined, image: undefined, model: undefined }))
  }

  const changeSize = (event: ChangeEvent<HTMLSelectElement>) => {
    setSize(SIZES.find((entry) => entry.value === event.target.value)?.value ?? "medium")
    clearFieldError("count")
  }

  const acceptImage = async (file: File | undefined) => {
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setFieldErrors((current) => ({ ...current, image: "Use uma imagem PNG, JPG ou WEBP de até 10 MB." }))
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      setImage({ name: file.name, size: file.size, dataUrl })
      setFieldErrors((current) => ({ ...current, image: undefined }))
    } catch {
      setFieldErrors((current) => ({ ...current, image: "Não foi possível ler a imagem. Tente outro arquivo." }))
    }
  }

  const openPicker = () => fileRef.current?.click()

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    void acceptImage(file)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (generating) return
    event.dataTransfer.dropEffect = "copy"
    setDragActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (!generating) void acceptImage(event.dataTransfer.files?.[0])
  }

  const removeImage = () => {
    setImage(null)
    focusLater("image")
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (source === "text" && !description.trim()) errors.description = "Descreva o atendimento que a IA deve gerar."
    if (source === "image" && !image) errors.image = "Selecione uma imagem de referência."
    if (source === "image" && !currentModel.vision) {
      errors.model = `O ${currentModel.name} não analisa imagens. Escolha outro modelo.`
    }
    if (size === "custom") {
      const value = Number(count)
      if (!count.trim() || !Number.isInteger(value) || value < MIN_COUNT || value > MAX_COUNT) {
        errors.count = `Informe um número inteiro de ${MIN_COUNT} a ${MAX_COUNT}.`
      }
    }
    if (!apiKey.trim()) errors.apiKey = "Informe a chave da API da OpenAI."
    else if (!apiKey.trim().startsWith("sk-")) errors.apiKey = "A chave da API da OpenAI começa com sk-."
    return errors
  }

  const generate = async () => {
    if (generating) return
    const errors = validate()
    setFieldErrors(errors)
    const firstInvalid = FIELD_ORDER.find((field) => errors[field])
    if (firstInvalid) {
      setFailure(null)
      document.getElementById(idFor(firstInvalid))?.focus()
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setFailure(null)

    const requestedCount = size === "custom" ? Number(count) : undefined
    const payload = {
      description: source === "text" ? description.trim() : "",
      size,
      customNodeCount: requestedCount,
      model,
      apiKey: apiKey.trim(),
      additionalContext: source === "image" ? context.trim() : undefined,
      imageUrl: source === "image" ? image?.dataUrl : undefined,
    }

    try {
      const response = await fetch("/api/generate-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => null)) as GenerateResponse | null

      if (!data) {
        setFailure({
          title: "Resposta inesperada do servidor.",
          details: `Código HTTP ${response.status}. Tente novamente.`,
          items: [],
        })
        return
      }

      if (!response.ok || data.success !== true) {
        const items = Array.isArray(data.validationErrors)
          ? data.validationErrors.filter((item): item is string => typeof item === "string" && item.trim() !== "")
          : []
        setFailure({
          title: text(data.error) || "Não foi possível gerar o fluxo.",
          details: text(data.details) || (items.length > 0 ? "Gere novamente para obter uma nova versão." : undefined),
          items,
        })
        return
      }

      let flow: AtendimentoFlow
      try {
        flow = importFlow(data.workflow)
        exportFlow(flow)
      } catch (error) {
        setFailure({ title: "O fluxo recebido não está no formato de Atendimento.", items: messageLines(error) })
        return
      }

      setResult({
        flow,
        prompt: text(data.prompt),
        model,
        sizeLabel: requestedCount ? `Personalizado (${plural(requestedCount, "componente", "componentes")})` : currentSize.label,
        source,
        description: payload.description,
        context: payload.additionalContext ?? "",
        generatedAt: new Date().toISOString(),
      })
    } catch {
      if (controller.signal.aborted) return
      setFailure({
        title: "Não foi possível contatar o servidor.",
        details: "Verifique a conexão e tente novamente.",
        items: [],
      })
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setGenerating(false)
      }
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void generate()
  }

  const cancel = () => {
    if (generating) abortRef.current?.abort()
    else onOpenChange(false)
  }

  const editRequest = () => {
    setResult(null)
    setFailure(null)
    focusLater(source === "text" ? "description" : "context")
  }

  const importResult = () => {
    if (!result) return
    let flow: AtendimentoFlow
    try {
      flow = importFlow(result.flow)
      exportFlow(flow)
    } catch (error) {
      setFailure({ title: "Não foi possível importar o fluxo.", items: messageLines(error) })
      return
    }
    if (!onWorkflowGenerated(flow)) return
    resetOnCloseRef.current = true
    onOpenChange(false)
  }

  const downloadResult = () => {
    if (!result) return
    try {
      const flow = stampExport(importFlow(result.flow))
      const fileName = exportFileName(flow)
      downloadJson(exportFlow(flow), fileName)
      toast({ title: "Arquivo baixado", description: fileName })
    } catch (error) {
      setFailure({ title: "Não foi possível exportar o JSON.", items: messageLines(error) })
    }
  }

  const downloadPrompt = () => {
    if (!result?.prompt) return
    const fence = codeFence(result.prompt)
    const request =
      result.source === "text"
        ? result.description
        : ["Imagem de referência anexada.", result.context ? `Contexto adicional: ${result.context}` : ""]
            .filter(Boolean)
            .join("\n\n")
    const content = [
      "# Prompt de geração do fluxo",
      "",
      `- Fluxo: ${result.flow.name}`,
      `- Modelo: ${modelName(result.model)}`,
      `- Tamanho: ${result.sizeLabel}`,
      `- Origem: ${result.source === "text" ? "descrição em texto" : "imagem de referência"}`,
      `- Gerado em: ${result.generatedAt}`,
      "",
      "## Solicitação",
      "",
      request,
      "",
      "## Prompt enviado ao modelo",
      "",
      fence,
      result.prompt,
      fence,
      "",
    ].join("\n")
    const fileName = `${result.flow.name.trim() || "Atendimento"}-prompt-${result.generatedAt.slice(0, 10)}.md`
    downloadText(content, fileName, "text/markdown;charset=utf-8")
    toast({ title: "Arquivo baixado", description: fileName })
  }

  const handleOpenAutoFocus = (event: Event) => {
    const target = result ? importRef.current : source === "text" ? document.getElementById(idFor("description")) : null
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  const handleCloseAutoFocus = () => {
    setFailure(null)
    setFieldErrors({})
    setShowKey(false)
    setDragActive(false)
    if (!resetOnCloseRef.current) return
    resetOnCloseRef.current = false
    setDescription("")
    setImage(null)
    setContext("")
    setResult(null)
  }

  const handleInteractOutside = (event: Event) => {
    if (generating || result) event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        onInteractOutside={handleInteractOutside}
        className={cn(
          ui.dialog,
          "flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl",
        )}
      >
        <DialogHeader className="flex-row items-start gap-3 space-y-0 border-b border-flow-border px-5 py-4 pr-12 text-left">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent"
            aria-hidden="true"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-semibold leading-6 tracking-normal text-flow-fg">
              Gerar fluxo com IA
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs leading-5 text-flow-muted">
              Descreva o atendimento ou envie uma imagem de referência. O resultado segue o formato JSON de Atendimento.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {result ? (
            <section aria-labelledby={idFor("result-title")} className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-flow-success/40 bg-flow-success/10 p-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flow-success text-white"
                  aria-hidden="true"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 id={idFor("result-title")} className="text-sm font-semibold text-flow-fg">
                    Fluxo gerado
                  </h3>
                  <p className="mt-0.5 break-words text-xs text-flow-muted-strong">{result.flow.name}</p>
                  <ul aria-label="Resumo do fluxo gerado" className="mt-2 flex flex-wrap gap-1.5">
                    <li className={ui.chip}>{plural(result.flow.nodes.length, "componente", "componentes")}</li>
                    <li className={ui.chip}>{plural(result.flow.edges.length, "conexão", "conexões")}</li>
                    <li className={ui.chip}>{modelName(result.model)}</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 id={idFor("preview-title")} className={ui.sectionTitle}>
                  Prévia dos componentes
                </h3>
                <ol
                  aria-labelledby={idFor("preview-title")}
                  className="mt-2 overflow-hidden rounded-xl border border-flow-border bg-flow-surface"
                >
                  {previewNodes.map((node) => {
                    const summary = nodeSummary(node)
                    return (
                      <li
                        key={node.id}
                        className="flex items-center gap-3 border-t border-flow-border px-3 py-2 first:border-t-0"
                      >
                        <span
                          aria-hidden="true"
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: nodeColor(node) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-flow-fg">{getComponentLabel(node.data.type)}</p>
                          {summary ? <p className="truncate text-[11px] text-flow-muted">{summary}</p> : null}
                        </div>
                        <span className="shrink-0 rounded-md bg-flow-soft px-1.5 py-0.5 text-[10px] font-medium text-flow-muted">
                          ID {node.id}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>

              <p className={ui.hint}>
                Importar substitui o fluxo aberto no editor. Para voltar ao fluxo anterior, use Desfazer (Ctrl+Z).
              </p>
            </section>
          ) : (
            <form id={idFor("form")} noValidate onSubmit={submit} className="space-y-5">
              <Tabs value={source} onValueChange={changeSource}>
                <TabsList
                  aria-label="Origem da geração"
                  className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-flow-border bg-flow-soft p-1 text-flow-muted-strong"
                >
                  <TabsTrigger value="text" disabled={generating} className={tabTrigger}>
                    <Type className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Descrição em texto
                  </TabsTrigger>
                  <TabsTrigger value="image" disabled={generating} className={tabTrigger}>
                    <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Imagem de referência
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" tabIndex={-1} className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">
                  <label htmlFor={idFor("description")} className={ui.label}>
                    Descrição do atendimento
                  </label>
                  <textarea
                    id={idFor("description")}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                      clearFieldError("description")
                    }}
                    rows={6}
                    disabled={generating}
                    placeholder="Ex.: Clínica médica. Mensagem de boas-vindas e um menu para agendar consulta, falar com a recepção ou encerrar o atendimento."
                    aria-invalid={fieldErrors.description ? true : undefined}
                    aria-describedby={describedBy(
                      idFor("description-hint"),
                      fieldErrors.description && idFor("description-error"),
                    )}
                    className={cn(ui.textarea, "min-h-32 resize-y", fieldBase, fieldErrors.description && invalidField)}
                  />
                  <p id={idFor("description-hint")} className={ui.hint}>
                    Informe o objetivo, as etapas e as opções que o cliente deve ver.
                  </p>
                  {fieldErrors.description ? (
                    <p id={idFor("description-error")} className={ui.error}>
                      {fieldErrors.description}
                    </p>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="image"
                  tabIndex={-1}
                  className="mt-4 space-y-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      onChange={onFileChange}
                      className="hidden"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
                      {image ? (
                        <div
                          className={cn(
                            "space-y-3 rounded-xl border border-flow-border bg-flow-soft p-3 transition",
                            dragActive && "border-flow-accent bg-flow-accent/10",
                          )}
                        >
                          <img
                            src={image.dataUrl}
                            alt="Prévia da imagem de referência"
                            className="mx-auto block max-h-48 w-auto rounded-lg border border-flow-border bg-flow-surface object-contain"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-flow-fg">{image.name}</p>
                              <p className="text-[11px] text-flow-muted">{formatBytes(image.size)}</p>
                            </div>
                            <button type="button" onClick={openPicker} disabled={generating} className={ui.button}>
                              <Upload className="h-4 w-4" aria-hidden="true" />
                              Trocar imagem
                            </button>
                            <button type="button" onClick={removeImage} disabled={generating} className={ui.dangerButton}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Remover
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          id={idFor("image")}
                          type="button"
                          onClick={openPicker}
                          disabled={generating}
                          aria-describedby={describedBy(idFor("image-hint"), fieldErrors.image && idFor("image-error"))}
                          className={cn(
                            "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-flow-border bg-flow-soft px-4 py-8 text-center transition hover:border-flow-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40",
                            dragActive && "border-flow-accent bg-flow-accent/10",
                            fieldErrors.image && "border-flow-danger",
                          )}
                        >
                          <span
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-flow-surface text-flow-muted-strong"
                            aria-hidden="true"
                          >
                            <Upload className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-semibold text-flow-fg">Selecionar imagem</span>
                          <span className="text-xs text-flow-muted">ou arraste o arquivo para esta área</span>
                        </button>
                      )}
                    </div>
                    <p id={idFor("image-hint")} className={ui.hint}>
                      PNG, JPG ou WEBP, até 10 MB. A IA reproduz as etapas, mensagens e conexões da imagem.
                    </p>
                    {fieldErrors.image ? (
                      <p id={idFor("image-error")} role="alert" className={ui.error}>
                        {fieldErrors.image}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor={idFor("context")} className={ui.label}>
                      Contexto adicional <span className="font-normal text-flow-muted">(opcional)</span>
                    </label>
                    <textarea
                      id={idFor("context")}
                      value={context}
                      onChange={(event) => setContext(event.target.value)}
                      rows={3}
                      disabled={generating}
                      placeholder="Ex.: use o nome Clínica Exemplo nas mensagens e informe o horário de atendimento."
                      aria-describedby={idFor("context-hint")}
                      className={cn(ui.textarea, "min-h-20 resize-y", fieldBase)}
                    />
                    <p id={idFor("context-hint")} className={ui.hint}>
                      Detalhes que a imagem não mostra, como nomes, horários e o tom das mensagens.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={idFor("model")} className={ui.label}>
                    Modelo
                  </label>
                  <select
                    id={idFor("model")}
                    value={model}
                    onChange={(event) => {
                      setModel(event.target.value)
                      clearFieldError("model")
                    }}
                    disabled={generating}
                    aria-invalid={fieldErrors.model ? true : undefined}
                    aria-describedby={describedBy(idFor("model-hint"), fieldErrors.model && idFor("model-error"))}
                    className={cn(ui.select, fieldBase, fieldErrors.model && invalidField)}
                  >
                    {MODELS.map((entry) => (
                      <option key={entry.value} value={entry.value} className={ui.option}>
                        {entry.note ? `${entry.name} (${entry.note})` : entry.name}
                      </option>
                    ))}
                  </select>
                  <p id={idFor("model-hint")} className={ui.hint}>
                    {currentModel.hint}
                  </p>
                  {fieldErrors.model ? (
                    <p id={idFor("model-error")} className={ui.error}>
                      {fieldErrors.model}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor={idFor("size")} className={ui.label}>
                    Tamanho do fluxo
                  </label>
                  <select
                    id={idFor("size")}
                    value={size}
                    onChange={changeSize}
                    disabled={generating}
                    aria-describedby={idFor("size-hint")}
                    className={cn(ui.select, fieldBase)}
                  >
                    {SIZES.map((entry) => (
                      <option key={entry.value} value={entry.value} className={ui.option}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <p id={idFor("size-hint")} className={ui.hint}>
                    {currentSize.hint}
                  </p>
                  {size === "custom" ? (
                    <div className="mt-3">
                      <label htmlFor={idFor("count")} className={ui.label}>
                        Quantidade de componentes
                      </label>
                      <input
                        id={idFor("count")}
                        type="number"
                        inputMode="numeric"
                        min={MIN_COUNT}
                        max={MAX_COUNT}
                        step={1}
                        value={count}
                        onChange={(event) => {
                          setCount(event.target.value)
                          clearFieldError("count")
                        }}
                        disabled={generating}
                        aria-invalid={fieldErrors.count ? true : undefined}
                        aria-describedby={describedBy(idFor("count-hint"), fieldErrors.count && idFor("count-error"))}
                        className={cn(ui.input, "w-28", fieldBase, fieldErrors.count && invalidField)}
                      />
                      <p id={idFor("count-hint")} className={ui.hint}>
                        De {MIN_COUNT} a {MAX_COUNT}, contando o início.
                      </p>
                      {fieldErrors.count ? (
                        <p id={idFor("count-error")} className={ui.error}>
                          {fieldErrors.count}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <label htmlFor={idFor("apiKey")} className={ui.label}>
                  Chave da API da OpenAI
                </label>
                <div className="relative">
                  <input
                    id={idFor("apiKey")}
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value)
                      clearFieldError("apiKey")
                    }}
                    disabled={generating}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={fieldErrors.apiKey ? true : undefined}
                    aria-describedby={describedBy(idFor("apiKey-hint"), fieldErrors.apiKey && idFor("apiKey-error"))}
                    className={cn(ui.input, "pr-10 font-mono", fieldBase, fieldErrors.apiKey && invalidField)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((current) => !current)}
                    disabled={generating}
                    aria-pressed={showKey}
                    aria-label="Mostrar chave"
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <p id={idFor("apiKey-hint")} className={ui.hint}>
                  Usada somente nesta geração. A chave não é salva.
                </p>
                {fieldErrors.apiKey ? (
                  <p id={idFor("apiKey-error")} className={ui.error}>
                    {fieldErrors.apiKey}
                  </p>
                ) : null}
              </div>
            </form>
          )}

          {failure ? (
            <div
              ref={failureRef}
              role="alert"
              className="rounded-xl border border-flow-danger/40 bg-flow-danger/10 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flow-danger" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold text-flow-danger">{failure.title}</p>
                  {failure.details ? <p className="text-xs text-flow-muted-strong">{failure.details}</p> : null}
                  {failure.items.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-flow-muted-strong">
                      {failure.items.map((item, index) => (
                        <li key={`${index}-${item}`} className="break-words">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-flow-border bg-flow-soft px-5 py-3">
          {result ? (
            <>
              <button type="button" onClick={editRequest} className={ui.button}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Editar solicitação
              </button>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={downloadPrompt} disabled={!result.prompt} className={ui.button}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Baixar prompt
                </button>
                <button type="button" onClick={downloadResult} className={ui.button}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Baixar JSON
                </button>
                <button ref={importRef} type="button" onClick={importResult} className={ui.primaryButton}>
                  <FileJson className="h-4 w-4" aria-hidden="true" />
                  Importar para o editor
                </button>
              </div>
            </>
          ) : (
            <>
              <p role="status" className="mr-auto flex min-h-8 items-center gap-2 text-xs text-flow-muted">
                {generating ? (
                  <>
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-flow-accent motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Gerando o fluxo. Isso pode levar até um minuto.
                  </>
                ) : null}
              </p>
              <button type="button" onClick={cancel} className={ui.button}>
                {generating ? "Cancelar geração" : "Cancelar"}
              </button>
              <button type="submit" form={idFor("form")} disabled={generating} className={ui.primaryButton}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {generating ? "Gerando..." : "Gerar fluxo"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
