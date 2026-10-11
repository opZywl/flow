"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Copy, Download, Loader2, RefreshCw, Upload, Workflow } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { importFlow } from "@/lib/atendimento/format"
import { cn } from "@/lib/utils"
import { BlipAPI, type BlipAccount, type FlowInfo } from "../../lib/blip-api"
import { ui } from "../ui"
import { IntegrationAction, IntegrationField, IntegrationNotice, IntegrationStatus, IntegrationSubmit } from "./IntegrationsMenu"

interface BlipIntegrationProps {
  onClose: () => void
}

const API_KEY_STORAGE = "blip_api_key"
const BOT_ID_STORAGE = "blip_bot_id"

function errorText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value
  if (value instanceof Error && value.message) return value.message
  if (value && typeof value === "object" && "description" in value && typeof value.description === "string" && value.description.trim()) {
    return value.description
  }
  return fallback
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function accountName(account: BlipAccount | null): string {
  return account?.fullName || account?.email || ""
}

export default function BlipIntegration({ onClose }: BlipIntegrationProps) {
  const [apiKey, setApiKey] = useState("")
  const [botId, setBotId] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [accountInfo, setAccountInfo] = useState<BlipAccount | null>(null)
  const [flows, setFlows] = useState<FlowInfo[]>([])
  const [isLoadingFlows, setIsLoadingFlows] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [importingId, setImportingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isSavingWebhook, setIsSavingWebhook] = useState(false)
  const webhookId = useId()

  const handleValidateConnection = useCallback(async (key: string, id: string) => {
    if (!key || !id) return

    setIsConnecting(true)
    try {
      const blipAPI = new BlipAPI(key)
      const result = await blipAPI.validateApiKey()

      if (result.success && result.data) {
        setIsConnected(true)
        setAccountInfo(result.data)
        try {
          localStorage.setItem(API_KEY_STORAGE, key)
          localStorage.setItem(BOT_ID_STORAGE, id)
        } catch {}

        setIsLoadingFlows(true)
        try {
          const flowsResult = await blipAPI.getFlows()
          if (flowsResult.success && flowsResult.data) setFlows(flowsResult.data)
        } finally {
          setIsLoadingFlows(false)
        }

        const name = accountName(result.data)
        toast({ title: "Conectado ao BliP", description: name ? `Conta: ${name}` : "Credenciais validadas." })
      } else {
        toast({
          title: "Credenciais inválidas",
          description: errorText(result.error, "Verifique a chave de API e o ID do bot."),
          variant: "destructive",
        })
        try {
          localStorage.removeItem(API_KEY_STORAGE)
          localStorage.removeItem(BOT_ID_STORAGE)
        } catch {}
      }
    } catch (error) {
      toast({ title: "Falha na conexão", description: errorText(error, "Erro desconhecido."), variant: "destructive" })
    } finally {
      setIsConnecting(false)
    }
  }, [])

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhook/blip`)
  }, [])

  useEffect(() => {
    let savedApiKey: string | null = null
    let savedBotId: string | null = null
    try {
      savedApiKey = localStorage.getItem(API_KEY_STORAGE)
      savedBotId = localStorage.getItem(BOT_ID_STORAGE)
    } catch {}

    if (savedApiKey && savedBotId) {
      setApiKey(savedApiKey)
      setBotId(savedBotId)
      void handleValidateConnection(savedApiKey, savedBotId)
    }
  }, [handleValidateConnection])

  const handleConnect = useCallback(async () => {
    const key = apiKey.trim()
    const id = botId.trim()
    if (!key || !id) {
      toast({ title: "Campos obrigatórios", description: "Preencha a chave de API e o ID do bot.", variant: "destructive" })
      return
    }

    setApiKey(key)
    setBotId(id)
    await handleValidateConnection(key, id)
  }, [apiKey, botId, handleValidateConnection])

  const handleDisconnect = useCallback(() => {
    setIsConnected(false)
    setApiKey("")
    setBotId("")
    setAccountInfo(null)
    setFlows([])
    try {
      localStorage.removeItem(API_KEY_STORAGE)
      localStorage.removeItem(BOT_ID_STORAGE)
    } catch {}
    toast({ title: "BliP desconectado", description: "As credenciais foram removidas deste navegador." })
  }, [])

  const handleRefreshFlows = useCallback(
    async (notify = true) => {
      if (!apiKey) return

      setIsLoadingFlows(true)
      try {
        const blipAPI = new BlipAPI(apiKey)
        const result = await blipAPI.getFlows()

        if (result.success && result.data) {
          setFlows(result.data)
          if (notify) {
            toast({ title: "Lista de fluxos atualizada", description: `${countLabel(result.data.length, "fluxo encontrado", "fluxos encontrados")}.` })
          }
        } else {
          toast({
            title: "Não foi possível carregar os fluxos",
            description: errorText(result.error, "Erro desconhecido."),
            variant: "destructive",
          })
        }
      } catch (error) {
        toast({ title: "Não foi possível carregar os fluxos", description: errorText(error, "Erro desconhecido."), variant: "destructive" })
      } finally {
        setIsLoadingFlows(false)
      }
    },
    [apiKey],
  )

  const handleImportFlow = useCallback(
    async (flowId: string, flowName: string) => {
      if (!apiKey) return

      setImportingId(flowId)
      try {
        toast({ title: "Importando fluxo", description: `Buscando ${flowName} no BliP.` })

        const blipAPI = new BlipAPI(apiKey)
        const result = await blipAPI.getFlow(flowId)

        if (result.success && result.data) {
          const convertedFlow = importFlow(blipAPI.convertFromBlipFormat(result.data))
          const request = { input: convertedFlow, accepted: false }
          window.dispatchEvent(new CustomEvent("workflow:import", { detail: request }))

          if (request.accepted) {
            toast({
              title: "Fluxo importado",
              description: `${flowName} foi carregado no editor com ${countLabel(convertedFlow.nodes.length, "componente", "componentes")}.`,
            })
            onClose()
          }
        } else {
          toast({
            title: "Não foi possível importar",
            description: errorText(result.error, "Erro ao importar o fluxo."),
            variant: "destructive",
          })
        }
      } catch (error) {
        toast({ title: "Não foi possível importar", description: errorText(error, "Erro desconhecido."), variant: "destructive" })
      } finally {
        setImportingId(null)
      }
    },
    [apiKey, onClose],
  )

  const handleExportFlow = useCallback(async () => {
    if (!apiKey) return

    setIsExporting(true)
    try {
      const currentFlow = localStorage.getItem("workflow")
      if (!currentFlow) {
        toast({ title: "Nenhum fluxo encontrado", description: "Crie um fluxo antes de enviar ao BliP.", variant: "destructive" })
        return
      }

      const flowData = JSON.parse(currentFlow)
      const flowId = `exported-${Date.now()}`

      toast({ title: "Enviando fluxo", description: "Aguardando a resposta do BliP." })

      const blipAPI = new BlipAPI(apiKey)
      const result = await blipAPI.createOrUpdateFlow(flowId, flowData)

      if (result.success) {
        toast({ title: "Fluxo enviado", description: `${flowData.name || "Fluxo sem nome"} foi enviado ao BliP.` })
        await handleRefreshFlows(false)
      } else {
        toast({ title: "Não foi possível enviar", description: errorText(result.error, "Erro ao enviar o fluxo."), variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Não foi possível enviar", description: errorText(error, "Erro desconhecido."), variant: "destructive" })
    } finally {
      setIsExporting(false)
    }
  }, [apiKey, handleRefreshFlows])

  const handleSetupWebhook = useCallback(async () => {
    const url = webhookUrl.trim()
    if (!apiKey || !url) return

    setIsSavingWebhook(true)
    try {
      toast({ title: "Configurando webhook", description: "Registrando a URL do webhook no BliP." })

      const blipAPI = new BlipAPI(apiKey)
      const result = await blipAPI.setupWebhook(url)

      if (result.success) {
        toast({ title: "Webhook configurado", description: "A URL do webhook foi registrada no BliP." })
      } else {
        toast({
          title: "Não foi possível configurar o webhook",
          description: errorText(result.error, "Erro ao configurar o webhook."),
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({ title: "Não foi possível configurar o webhook", description: errorText(error, "Erro desconhecido."), variant: "destructive" })
    } finally {
      setIsSavingWebhook(false)
    }
  }, [apiKey, webhookUrl])

  const copyWebhookUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast({ title: "URL copiada", description: "A URL do webhook está na área de transferência." })
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione a URL e copie manualmente.", variant: "destructive" })
    }
  }, [webhookUrl])

  if (!isConnected) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void handleConnect()
        }}
        className="space-y-4"
      >
        <IntegrationNotice title="Como conectar" link={{ href: "https://portal.blip.ai", label: "Abrir portal do BliP" }}>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Acesse o portal do BliP e abra o bot.</li>
            <li>Em Configurações, abra Conexões e copie a chave de API e o ID do bot.</li>
            <li>Cole as credenciais abaixo e clique em Conectar.</li>
          </ol>
        </IntegrationNotice>

        <IntegrationField
          label="Chave de API"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Cole a chave de API do bot"
        />
        <IntegrationField
          label="ID do bot"
          type="text"
          autoComplete="off"
          spellCheck={false}
          required
          value={botId}
          onChange={(event) => setBotId(event.target.value)}
          placeholder="Identificador do bot no BliP"
        />

        <IntegrationSubmit
          label="Conectar"
          busyLabel="Conectando..."
          busy={isConnecting}
          hint="A conexão usa a API oficial do BliP (http.msging.net). As credenciais ficam salvas apenas neste navegador."
        />
      </form>
    )
  }

  const name = accountName(accountInfo)

  return (
    <div className="space-y-5">
      <IntegrationStatus title="Conectado ao BliP" detail={name ? `Conta: ${name}` : undefined} onDisconnect={handleDisconnect} />

      <div>
        <h3 className={ui.sectionTitle}>Ações</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <IntegrationAction
            icon={Upload}
            title="Enviar fluxo atual"
            description="Envia o fluxo do editor ao BliP como um novo fluxo."
            busy={isExporting}
            onClick={() => void handleExportFlow()}
          />
          <IntegrationAction
            icon={RefreshCw}
            title="Atualizar lista"
            description="Recarrega os fluxos disponíveis no BliP."
            busy={isLoadingFlows}
            onClick={() => void handleRefreshFlows()}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className={ui.sectionTitle}>Fluxos do BliP</h3>
          {isLoadingFlows ? null : <span className="text-[11px] text-flow-muted">{countLabel(flows.length, "fluxo", "fluxos")}</span>}
        </div>

        {isLoadingFlows ? (
          <div
            role="status"
            className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-flow-border px-3 py-6 text-xs text-flow-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin text-flow-accent" />
            Carregando fluxos...
          </div>
        ) : flows.length > 0 ? (
          <ul className="mt-2 divide-y divide-flow-border overflow-hidden rounded-xl border border-flow-border">
            {flows.map((flow) => {
              const importing = importingId === flow.id
              return (
                <li key={flow.id} className="flex items-center gap-3 bg-flow-surface px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-soft text-flow-muted-strong">
                    <Workflow className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-flow-fg">{flow.name}</p>
                    <p className="truncate text-xs text-flow-muted">{flow.description || `ID: ${flow.id}`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleImportFlow(flow.id, flow.name)}
                    disabled={importingId !== null}
                    aria-busy={importing || undefined}
                    className={ui.button}
                  >
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {importing ? "Importando..." : "Importar"}
                    <span className="sr-only">{` ${flow.name}`}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-2 rounded-xl border border-dashed border-flow-border px-3 py-6 text-center">
            <p className="text-sm font-semibold text-flow-fg">Nenhum fluxo encontrado</p>
            <p className="mt-1 text-xs leading-5 text-flow-muted">Crie fluxos no portal do BliP e clique em Atualizar lista.</p>
          </div>
        )}
      </div>

      <div>
        <h3 className={ui.sectionTitle}>Webhook</h3>
        <label htmlFor={webhookId} className={cn(ui.label, "mt-2")}>
          URL do webhook
        </label>
        <div className="flex gap-2">
          <input
            id={webhookId}
            type="url"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://"
            spellCheck={false}
            aria-describedby={`${webhookId}-hint`}
            className={cn(ui.input, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={() => void copyWebhookUrl()}
            disabled={!webhookUrl}
            aria-label="Copiar URL do webhook"
            title="Copiar URL"
            className={cn(ui.toolButton, "h-9 w-9")}
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleSetupWebhook()}
            disabled={!webhookUrl.trim() || isSavingWebhook}
            aria-busy={isSavingWebhook || undefined}
            className={cn(ui.button, "h-9")}
          >
            {isSavingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Configurar
          </button>
        </div>
        <p id={`${webhookId}-hint`} className={ui.hint}>
          O BliP enviará os eventos do bot para esta URL.
        </p>
      </div>
    </div>
  )
}
