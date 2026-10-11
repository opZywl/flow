"use client"

import { useId, useState, type ComponentType, type InputHTMLAttributes, type ReactNode } from "react"
import dynamic from "next/dynamic"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowLeft, Check, ChevronRight, ExternalLink, Globe, Info, Loader2, Mail, Plug, Send, Unplug, X } from "lucide-react"
import { FiInstagram, FiSlack, FiTwitter } from "react-icons/fi"
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ui } from "../ui"

type IconComponent = ComponentType<{ className?: string }>
type ConnectorId = "blip" | "figma"

interface Connector {
  id: ConnectorId
  name: string
  description: string
  category: string
  summary: string
  logo: { src: string; size: number; className: string }
}

interface UpcomingIntegration {
  id: string
  name: string
  description: string
  category: string
  icon: IconComponent
}

interface IntegrationsMenuProps {
  isOpen: boolean
  onClose: () => void
}

const CONNECTORS: Connector[] = [
  {
    id: "blip",
    name: "BliP",
    description: "Plataforma de chatbots e automação conversacional",
    category: "Chatbots",
    summary: "Importe fluxos e configure o webhook pela API oficial do BliP.",
    logo: { src: "/icons/blip.png", size: 22, className: "h-[22px] w-[22px] object-cover object-left" },
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design colaborativo e prototipagem de fluxos",
    category: "Design",
    summary: "Consulte arquivos do Figma e baixe o JSON de Atendimento.",
    logo: { src: "/icons/figma.png", size: 32, className: "h-8 w-8 object-contain" },
  },
]

const UPCOMING: UpcomingIntegration[] = [
  { id: "telegram", name: "Telegram", description: "Bot para Telegram com a API oficial", category: "Mensagens", icon: Send },
  { id: "slack", name: "Slack", description: "Mensagens no espaço de trabalho", category: "Colaboração", icon: FiSlack },
  { id: "email", name: "E-mail marketing", description: "Automação de campanhas por e-mail", category: "Marketing", icon: Mail },
  { id: "widget", name: "Chat no site", description: "Janela de chat para o seu site", category: "Site", icon: Globe },
  { id: "twitter", name: "X (Twitter)", description: "Automação de mensagens no X", category: "Redes sociais", icon: FiTwitter },
  { id: "instagram", name: "Instagram", description: "Mensagens de contas comerciais", category: "Redes sociais", icon: FiInstagram },
]

const logoTile = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-flow-border bg-flow-soft"
const categoryChip = cn(ui.chip, "shrink-0 px-1.5 py-0.5 text-[10px] leading-4")

const BlipIntegration = dynamic(() => import("./BliP"), { ssr: false, loading: ConnectorLoading })
const FigmaIntegration = dynamic(() => import("./FigmaIntegration"), { ssr: false, loading: ConnectorLoading })

export default function IntegrationsMenu({ isOpen, onClose }: IntegrationsMenuProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogPortal>
        <DialogOverlay className="grid place-items-center bg-black/50 p-4 duration-200">
          <DialogPrimitive.Content
            className={cn(
              ui.dialog,
              "relative flex h-[min(40rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <IntegrationsPanel onClose={onClose} />
          </DialogPrimitive.Content>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  )
}

function IntegrationsPanel({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ConnectorId | null>(null)
  const [returnTo, setReturnTo] = useState<ConnectorId | null>(null)
  const connector = CONNECTORS.find((item) => item.id === view)

  return (
    <>
      <div className="flex items-start gap-3 border-b border-flow-border px-5 py-4">
        {connector ? (
          <ConnectorLogo connector={connector} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent">
            <Plug className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-base font-bold leading-6 tracking-normal text-flow-fg">
            {connector ? connector.name : "Integrações"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs leading-5 text-flow-muted">
            {connector ? connector.summary : "Conecte o editor a outras plataformas."}
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Fechar integrações"
            title="Fechar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>
      </div>

      <div key={view ?? "catalog"} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {view === "blip" ? (
          <BlipIntegration onClose={onClose} />
        ) : view === "figma" ? (
          <FigmaIntegration />
        ) : (
          <IntegrationCatalog focusId={returnTo} onSelect={setView} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-flow-border bg-flow-soft px-5 py-3">
        {connector ? (
          <button
            type="button"
            onClick={() => {
              setReturnTo(connector.id)
              setView(null)
            }}
            className={ui.button}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
        ) : (
          <p className="text-xs text-flow-muted">
            {`${CONNECTORS.length} de ${CONNECTORS.length + UPCOMING.length} integrações disponíveis`}
          </p>
        )}
        <DialogClose asChild>
          <button type="button" className={ui.button}>
            Fechar
          </button>
        </DialogClose>
      </div>
    </>
  )
}

function IntegrationCatalog({ focusId, onSelect }: { focusId: ConnectorId | null; onSelect: (id: ConnectorId) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className={ui.sectionTitle}>Disponíveis</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {CONNECTORS.map((connector) => (
            <li key={connector.id}>
              <button
                type="button"
                autoFocus={connector.id === focusId}
                onClick={() => onSelect(connector.id)}
                className={cn(
                  ui.card,
                  "group flex h-full w-full items-start gap-3 p-3 text-left transition hover:border-flow-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30",
                )}
              >
                <ConnectorLogo connector={connector} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-flow-fg">{connector.name}</span>
                    <span className={categoryChip}>{connector.category}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-flow-muted">{connector.description}</span>
                </span>
                <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-flow-muted transition group-hover:text-flow-accent" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className={ui.sectionTitle}>Em breve</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {UPCOMING.map(({ id, name, description, category, icon: Icon }) => (
            <li key={id} className={cn(ui.card, "flex items-start gap-3 p-3 opacity-70")}>
              <span className={logoTile}>
                <Icon className="h-5 w-5 text-flow-muted" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-flow-fg">{name}</p>
                  <span className={categoryChip}>{category}</span>
                </div>
                <p title={description} className="mt-1 truncate text-xs leading-5 text-flow-muted">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ConnectorLogo({ connector }: { connector: Connector }) {
  return (
    <span className={logoTile}>
      <img
        src={connector.logo.src}
        alt=""
        width={connector.logo.size}
        height={connector.logo.size}
        draggable={false}
        className={connector.logo.className}
      />
    </span>
  )
}

function ConnectorLoading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-xs text-flow-muted duration-200 animate-in fade-in-0 fill-mode-both delay-150"
    >
      <Loader2 className="h-4 w-4 animate-spin text-flow-accent" />
      Carregando...
    </div>
  )
}

export function IntegrationNotice({
  title,
  link,
  children,
}: {
  title: string
  link?: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-flow-border bg-flow-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-flow-muted-strong">
        <Info className="h-3.5 w-3.5 shrink-0 text-flow-accent" />
        {title}
      </p>
      <div className="mt-1 space-y-1 text-xs leading-5 text-flow-muted">{children}</div>
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(ui.linkButton, "mt-2 inline-flex items-center gap-1")}
        >
          {link.label}
          <ExternalLink className="h-3 w-3" />
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      ) : null}
    </div>
  )
}

export function IntegrationStatus({ title, detail, onDisconnect }: { title: string; detail?: string; onDisconnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-flow-success/30 bg-flow-success/10 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flow-success text-white">
        <Check className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-flow-fg">{title}</p>
        {detail ? <p className="truncate text-xs text-flow-muted">{detail}</p> : null}
      </div>
      <button type="button" onClick={onDisconnect} className={ui.dangerButton}>
        <Unplug className="h-3.5 w-3.5" />
        Desconectar
      </button>
    </div>
  )
}

export function IntegrationAction({
  icon: Icon,
  title,
  description,
  busy = false,
  onClick,
}: {
  icon: IconComponent
  title: string
  description: string
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      className={cn(
        ui.card,
        "flex h-full w-full items-start gap-3 p-3 text-left transition hover:border-flow-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-accent/15 text-flow-accent">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-flow-fg">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-flow-muted">{description}</span>
      </span>
    </button>
  )
}

type IntegrationFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  label: string
  hint?: string
}

export function IntegrationField({ label, hint, ...props }: IntegrationFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <input {...props} id={id} aria-describedby={hint ? hintId : undefined} className={ui.input} />
      {hint ? (
        <p id={hintId} className={ui.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function IntegrationSubmit({ label, busyLabel, busy, hint }: { label: string; busyLabel: string; busy: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-flow-border pt-4">
      {hint ? <p className="mr-auto min-w-0 flex-1 basis-56 text-[11px] leading-4 text-flow-muted">{hint}</p> : null}
      <button type="submit" disabled={busy} aria-busy={busy || undefined} className={ui.primaryButton}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {busy ? busyLabel : label}
      </button>
    </div>
  )
}
