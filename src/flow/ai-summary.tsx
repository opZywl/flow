"use client"

import { Cpu, SlidersHorizontal } from "lucide-react"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"
import { cn } from "@/lib/utils"
import { EFFORT_OPTIONS, modelName, pickEffort } from "./ai/generation-client"
import { openAiSettings, useAiSetting } from "./ai/settings-store"
import { ui } from "./ui"

export const AI_SUMMARY_SETTINGS = "Configurar IA"
export const AI_SUMMARY_MISSING = "Chave não informada"

function providerInfo(id: ProviderId) {
  return PROVIDERS.find((entry) => entry.id === id) ?? PROVIDERS[0]
}

export function useAiSummary(): { text: string; hasKey: boolean } {
  const [provider] = useAiSetting("provider")
  const [keys] = useAiSetting("keys")
  const [models] = useAiSetting("models")
  const [fetched] = useAiSetting("fetched")
  const [effortChoice] = useAiSetting("effortChoice")
  const info = providerInfo(provider)
  const model = models[provider] || info.presets[0].id
  const effort = pickEffort(effortChoice, provider, model)
  const text = `${info.vendor} · ${modelName(info, model, fetched[provider]?.models)} · Esforço ${EFFORT_OPTIONS[effort].label.toLowerCase()}`
  return { text, hasKey: Boolean(keys[provider]?.trim()) }
}

export function AiSummary({ className }: { className?: string }) {
  const { text, hasKey } = useAiSummary()
  return (
    <div className={cn("flex items-center gap-2 text-[11px] leading-4 text-flow-muted", className)}>
      <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      {hasKey ? null : <span className="shrink-0 font-semibold text-flow-warning">{AI_SUMMARY_MISSING}</span>}
      <button
        type="button"
        onClick={() => openAiSettings({ focus: hasKey ? null : "apiKey" })}
        aria-haspopup="dialog"
        className={cn(ui.button, "h-7 shrink-0 gap-1.5 px-2 text-[11px]")}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {AI_SUMMARY_SETTINGS}
      </button>
    </div>
  )
}
