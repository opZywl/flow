"use client"

import { useCallback, useId, useState, type FormEvent } from "react"
import { Download, KeyRound, Link2, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { downloadJson } from "@/lib/atendimento/download"
import { exportFileName, exportFlow, importFlow, stampExport } from "@/lib/atendimento/format"
import { cn } from "@/lib/utils"
import { ui } from "../ui"
import { IntegrationAction, IntegrationField, IntegrationNotice, IntegrationStatus, IntegrationSubmit } from "./IntegrationsMenu"

type ConnectionMethod = "token" | "url"

interface FigmaUser {
  handle?: string
  email?: string
}

const TOKEN_STORAGE = "figma_access_token"
const FILE_URL = /figma\.com\/(?:file|design|proto|board)\/([a-zA-Z0-9]+)/
const METHODS = [
  { value: "token", label: "Token de acesso", icon: KeyRound },
  { value: "url", label: "Arquivo por URL", icon: Link2 },
] as const
const FILE_HINT = "O Figma fornece apenas o visual do arquivo. A lógica do fluxo vem do JSON de Atendimento."

export default function FigmaIntegration() {
  const [accessToken, setAccessToken] = useState("")
  const [fileUrl, setFileUrl] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [userInfo, setUserInfo] = useState<FigmaUser | null>(null)
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("token")
  const fileUrlId = useId()

  const handleValidateToken = useCallback(async (token: string) => {
    if (!token) return

    setIsConnecting(true)
    try {
      const response = await fetch("https://api.figma.com/v1/me", {
        headers: {
          "X-Figma-Token": token,
        },
      })

      if (response.ok) {
        const userData: FigmaUser = await response.json()
        setIsConnected(true)
        setUserInfo(userData)
        try {
          localStorage.setItem(TOKEN_STORAGE, token)
        } catch {}

        const user = userData.handle || userData.email
        toast({ title: "Conectado ao Figma", description: user ? `Usuário: ${user}` : "Token validado." })
      } else {
        toast({ title: "Token inválido", description: "Verifique o token de acesso do Figma.", variant: "destructive" })
      }
    } catch {
      toast({ title: "Falha na conexão", description: "Não foi possível conectar à API do Figma.", variant: "destructive" })
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const handleTokenConnect = useCallback(async () => {
    const token = accessToken.trim()
    if (!token) {
      toast({ title: "Token obrigatório", description: "Informe o token de acesso pessoal do Figma.", variant: "destructive" })
      return
    }

    setAccessToken(token)
    await handleValidateToken(token)
  }, [accessToken, handleValidateToken])

  const handleFileCheck = useCallback(async () => {
    const url = fileUrl.trim()
    const token = accessToken.trim()

    if (!url) {
      toast({ title: "URL obrigatória", description: "Informe a URL do arquivo do Figma.", variant: "destructive" })
      return
    }

    if (!token) {
      toast({ title: "Token necessário", description: "Informe o token de acesso para consultar o arquivo.", variant: "destructive" })
      return
    }

    const match = url.match(FILE_URL)
    if (!match) {
      toast({ title: "URL inválida", description: "Use o link de um arquivo do Figma (figma.com/design/...).", variant: "destructive" })
      return
    }

    const fileKey = match[1]

    setIsChecking(true)
    try {
      toast({ title: "Consultando arquivo", description: "Acessando o arquivo no Figma." })

      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
        headers: {
          "X-Figma-Token": token,
        },
      })

      if (response.ok) {
        const fileData = await response.json()

        toast({
          title: "Arquivo visual encontrado",
          description: `${fileData.name || "Arquivo"}: o arquivo do Figma não fornece a lógica de atendimento. Importe um JSON de Atendimento para criar o fluxo. O fluxo atual foi preservado.`,
        })
      } else {
        toast({
          title: "Não foi possível acessar o arquivo",
          description: "Confira a URL e se o token tem acesso ao arquivo.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Falha na consulta", description: "Não foi possível consultar o arquivo do Figma.", variant: "destructive" })
    } finally {
      setIsChecking(false)
    }
  }, [fileUrl, accessToken])

  const handleDisconnect = useCallback(() => {
    setIsConnected(false)
    setAccessToken("")
    setUserInfo(null)
    try {
      localStorage.removeItem(TOKEN_STORAGE)
    } catch {}
    toast({ title: "Figma desconectado", description: "O token foi removido deste navegador." })
  }, [])

  const handleDownload = useCallback(() => {
    try {
      const currentFlow = localStorage.getItem("workflow")
      if (!currentFlow) {
        toast({ title: "Nenhum fluxo encontrado", description: "Crie um fluxo antes de exportar.", variant: "destructive" })
        return
      }

      const flow = stampExport(importFlow(currentFlow))
      downloadJson(exportFlow(flow), exportFileName(flow))
      toast({ title: "Exportação concluída", description: "JSON de Atendimento completo baixado." })
    } catch (error) {
      toast({
        title: "Não foi possível exportar",
        description: error instanceof Error ? error.message : "Erro ao exportar o fluxo.",
        variant: "destructive",
      })
    }
  }, [])

  const submitFileCheck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleFileCheck()
  }

  if (isConnected) {
    const user = userInfo?.handle || userInfo?.email

    return (
      <div className="space-y-5">
        <IntegrationStatus title="Conectado ao Figma" detail={user ? `Usuário: ${user}` : undefined} onDisconnect={handleDisconnect} />

        <div>
          <h3 className={ui.sectionTitle}>Exportação</h3>
          <div className="mt-2">
            <IntegrationAction
              icon={Download}
              title="Baixar JSON de Atendimento"
              description="Baixa o fluxo atual no formato JSON de Atendimento."
              onClick={handleDownload}
            />
          </div>
        </div>

        <form noValidate onSubmit={submitFileCheck}>
          <h3 className={ui.sectionTitle}>Arquivo do Figma</h3>
          <label htmlFor={fileUrlId} className={cn(ui.label, "mt-2")}>
            URL do arquivo
          </label>
          <div className="flex gap-2">
            <input
              id={fileUrlId}
              type="url"
              value={fileUrl}
              onChange={(event) => setFileUrl(event.target.value)}
              placeholder="https://www.figma.com/design/..."
              spellCheck={false}
              aria-describedby={`${fileUrlId}-hint`}
              className={cn(ui.input, "min-w-0 flex-1")}
            />
            <button type="submit" disabled={isChecking} aria-busy={isChecking || undefined} className={cn(ui.button, "h-9")}>
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isChecking ? "Verificando..." : "Verificar"}
            </button>
          </div>
          <p id={`${fileUrlId}-hint`} className={ui.hint}>
            {FILE_HINT}
          </p>
        </form>

        <IntegrationNotice title="Limitações da API">
          <p>A API do Figma não lista os arquivos da conta automaticamente. Use o link direto de cada arquivo.</p>
        </IntegrationNotice>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Forma de conexão" className="flex flex-wrap gap-1">
        {METHODS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={connectionMethod === value}
            onClick={() => setConnectionMethod(value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
              connectionMethod === value
                ? "bg-flow-accent text-white shadow-sm"
                : "border border-flow-border bg-flow-surface text-flow-muted-strong hover:text-flow-fg",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {connectionMethod === "token" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void handleTokenConnect()
          }}
          className="space-y-4"
        >
          <IntegrationNotice
            title="Como obter o token"
            link={{ href: "https://www.figma.com/developers/api#access-tokens", label: "Documentação de tokens do Figma" }}
          >
            <p>Nas configurações da sua conta do Figma, gere um token de acesso pessoal com permissão de leitura e cole-o abaixo.</p>
          </IntegrationNotice>

          <IntegrationField
            label="Token de acesso pessoal"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="figd_..."
          />

          <IntegrationSubmit
            label="Conectar"
            busyLabel="Conectando..."
            busy={isConnecting}
            hint="O token é enviado somente para a API do Figma."
          />
        </form>
      ) : (
        <form noValidate onSubmit={submitFileCheck} className="space-y-4">
          <IntegrationNotice title="Consultar arquivo por URL">
            <p>Cole o link de um arquivo do Figma para consultá-lo. O token de acesso continua necessário para usar a API.</p>
          </IntegrationNotice>

          <IntegrationField
            label="Token de acesso pessoal"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="figd_..."
          />
          <IntegrationField
            label="URL do arquivo"
            type="url"
            spellCheck={false}
            required
            value={fileUrl}
            onChange={(event) => setFileUrl(event.target.value)}
            placeholder="https://www.figma.com/design/..."
          />

          <IntegrationSubmit label="Verificar arquivo" busyLabel="Verificando..." busy={isChecking} hint={FILE_HINT} />
        </form>
      )}
    </div>
  )
}
