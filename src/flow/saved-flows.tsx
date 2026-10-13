"use client"

import { useEffect, useState } from "react"
import { Copy, FolderOpen, Trash2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { SavedFlow } from "@/lib/atendimento/library"
import { ui } from "./ui"

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

const savedLabel = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date)
}

export default function SavedFlows({ open, onOpenChange, entries, currentId, onOpen, onDuplicate, onDelete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: SavedFlow[]
  currentId: string | null
  onOpen: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setPendingDelete(null)
  }, [open])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={entries.length ? `Meus fluxos, ${entries.length}` : "Meus fluxos"} title="Meus fluxos neste navegador" className={cn(ui.toolButton, "relative", open && ui.toolButtonActive)}>
          <FolderOpen className="h-4 w-4" aria-hidden />
          {entries.length > 0 && <span aria-hidden className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-flow-accent-strong px-1 text-center text-[10px] font-bold leading-4 text-white">{entries.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} collisionPadding={12} className={cn(ui.dialog, "w-96 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl p-4 shadow-xl")}>
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-flow-fg">Meus fluxos</h2>
          <p className="text-xs text-flow-muted">Ao criar um novo fluxo ou abrir outro, o atual é guardado aqui.</p>
        </div>
        {entries.length ? (
          <ul aria-label="Meus fluxos" className="max-h-80 space-y-1.5 overflow-y-auto">
            {entries.map((entry) => {
              const current = entry.id === currentId
              const name = entry.flow.name.trim() || "Sem nome"
              const confirming = pendingDelete === entry.id
              return (
                <li key={entry.id} className={cn(ui.card, "flex items-center gap-2 px-3 py-2", current && "border-flow-accent/60")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-flow-fg" title={name}>{name}</p>
                    <p className="text-[11px] leading-4 text-flow-muted">
                      {entry.flow.nodes.length} {entry.flow.nodes.length === 1 ? "componente" : "componentes"} · {savedLabel(entry.savedAt)}
                      {current && <span className="ml-1 font-semibold text-flow-accent">· aberto</span>}
                    </p>
                  </div>
                  {confirming ? (
                    <>
                      <button type="button" className={ui.button} onClick={() => setPendingDelete(null)}>Cancelar</button>
                      <button type="button" className={cn(ui.dangerButton, "border-flow-danger text-flow-danger")} onClick={() => { setPendingDelete(null); onDelete(entry.id) }} aria-label={`Confirmar exclusão de ${name}`}>Excluir</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={ui.button} disabled={current} onClick={() => onOpen(entry.id)} aria-label={`Abrir ${name}`}>Abrir</button>
                      <button type="button" className={ui.toolButton} onClick={() => onDuplicate(entry.id)} aria-label={`Duplicar ${name}`} title="Duplicar fluxo">
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button type="button" className={cn(ui.toolButton, "hover:border-flow-danger hover:text-flow-danger")} onClick={() => setPendingDelete(entry.id)} aria-label={`Excluir ${name}`} title="Excluir fluxo salvo">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-lg bg-flow-soft px-3 py-2.5 text-xs text-flow-muted-strong">Nenhum fluxo salvo ainda. Use Novo fluxo para guardar o atual e começar outro.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
