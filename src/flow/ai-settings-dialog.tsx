"use client"

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react"
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EFFORTS, LIMITS } from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"
import { cn } from "@/lib/utils"
import { EFFORT_OPTIONS, apiKeyError, effortChoices, keyWarning, modelChoices, pickEffort, plural, requestModels, type Listing } from "./ai/generation-client"
import {
  clearAiSettingsErrors,
  closeAiSettings,
  openAiSettings,
  useAiSetting,
  useAiSettingsDialog,
  visibleProviders,
  type AiSettingsField,
} from "./ai/settings-store"
import { FlowSelect } from "./flow-select"
import { ui } from "./ui"

export const AI_SETTINGS_TITLE = "Configurar IA"
export const AI_SETTINGS_DESCRIPTION = "A chave, o modelo e o esforço valem para o Gerar com IA e para o Copiloto."
export const AI_SETTINGS_DONE = "Concluir"
export const aiKeyHint = (of: string) => `A chave fica guardada só nesta aba, até você fechar a aba, e serve apenas para chamar a API ${of}.`

const fieldBase = "block disabled:cursor-not-allowed disabled:opacity-60"
const invalidField = "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"
const warningText = "mt-1 text-[11px] leading-4 text-flow-warning"

function providerInfo(id: ProviderId) {
  return PROVIDERS.find((entry) => entry.id === id) ?? PROVIDERS[0]
}

export default function AiSettingsDialog() {
  const baseId = useId()
  const idFor = (key: string) => `${baseId}-${key}`
  const describedBy = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(" ") || undefined
  const dialog = useAiSettingsDialog()
  const [provider, setProvider] = useAiSetting("provider")
  const [keys, setKeys] = useAiSetting("keys")
  const [models, setModels] = useAiSetting("models")
  const [fetched, setFetched] = useAiSetting("fetched")
  const [effortChoice, setEffortChoice] = useAiSetting("effortChoice")
  const [listing, setListing] = useState<Listing | null>(null)
  const [showKey, setShowKey] = useState(false)
  const listAbortRef = useRef<AbortController | null>(null)

  const errors = dialog.errors
  const shown = visibleProviders()
  const providerOptions = shown.map((entry) => ({ value: entry.id, label: entry.name }))
  const info = providerInfo(provider)
  const apiKey = keys[provider] ?? ""
  const listed = fetched[provider]?.models
  const model = models[provider] || info.presets[0].id
  const effort = pickEffort(effortChoice, provider, model)
  const effortOptions = effortChoices(provider, model)
  const modelOptions = modelChoices(info, model, listed)
  const warning = keyWarning(info, apiKey)
  const providerListing = listing?.provider === provider ? listing : null
  const listingBusy = providerListing?.state === "loading"
  const listingStatus = !providerListing
    ? ""
    : providerListing.state === "loading"
      ? "Buscando modelos."
      : providerListing.state === "done"
        ? providerListing.count
          ? `${plural(providerListing.count, "modelo disponível", "modelos disponíveis")} na sua conta.`
          : "Nenhum modelo compatível encontrado nesta conta."
        : ""

  const keyRef = useRef(apiKey)
  const returnRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    keyRef.current = apiKey
  })

  useEffect(() => {
    if (!dialog.open) return
    const active = document.activeElement
    returnRef.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [dialog.open])

  useEffect(() => {
    if (!dialog.open) return
    const field: AiSettingsField = dialog.focus ?? (keyRef.current.trim() ? "model" : "apiKey")
    const frame = window.requestAnimationFrame(() => document.getElementById(`${baseId}-${field}`)?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [dialog.open, dialog.seq, dialog.focus, baseId])

  useEffect(
    () => () => {
      listAbortRef.current?.abort()
    },
    [],
  )

  const close = () => {
    setShowKey(false)
    closeAiSettings()
  }

  const changeProvider = (value: string) => {
    const next = shown.find((entry) => entry.id === value)
    if (!next) return
    setProvider(next.id)
    setShowKey(false)
    clearAiSettingsErrors("provider", "apiKey", "model")
  }

  const changeKey = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    const changed = value.trim() !== apiKey.trim()
    setKeys((current) => ({ ...current, [provider]: value }))
    if (changed) {
      setFetched((current) => (current[provider] ? { ...current, [provider]: undefined } : current))
      if (listing?.provider === provider) {
        listAbortRef.current?.abort()
        listAbortRef.current = null
        setListing(null)
      }
    }
    clearAiSettingsErrors("apiKey")
  }

  const changeModel = (value: string) => {
    setModels((current) => ({ ...current, [provider]: value }))
    clearAiSettingsErrors("model")
  }

  const changeEffort = (value: string) => {
    const next = EFFORTS.find((entry) => entry === value)
    if (!next) return
    setEffortChoice(next)
    clearAiSettingsErrors("effort")
  }

  const clearLoading = (owner: ProviderId) =>
    setListing((current) => (current?.provider === owner && current.state === "loading" ? null : current))

  const fetchModels = async () => {
    const key = apiKey.trim()
    const invalidKey = apiKeyError(info, key)
    if (invalidKey) {
      openAiSettings({ focus: "apiKey", errors: { ...errors, apiKey: invalidKey } })
      return
    }
    listAbortRef.current?.abort()
    const controller = new AbortController()
    listAbortRef.current = controller
    const owner = provider
    setListing({ provider: owner, state: "loading" })
    try {
      const listedModels = await requestModels(owner, key, controller.signal)
      if (controller.signal.aborted) {
        clearLoading(owner)
        return
      }
      if (listedModels.ok) {
        setFetched((current) => ({ ...current, [owner]: { key, models: listedModels.models } }))
        setListing({ provider: owner, state: "done", count: listedModels.models.length })
      } else {
        setListing({ provider: owner, state: "error", error: listedModels.error, details: listedModels.details })
      }
    } catch {
      if (controller.signal.aborted) {
        clearLoading(owner)
        return
      }
      setListing({ provider: owner, state: "error", error: "Não foi possível buscar os modelos.", details: "Verifique a conexão e tente novamente." })
    } finally {
      if (listAbortRef.current === controller) listAbortRef.current = null
    }
  }

  return (
    <Dialog open={dialog.open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent
        aria-describedby={idFor("description")}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          const back = returnRef.current
          returnRef.current = null
          if (!back || !back.isConnected) return
          event.preventDefault()
          back.focus()
        }}
        className={cn(ui.dialog, "max-h-[90vh] max-w-md gap-4 overflow-y-auto rounded-xl sm:rounded-xl")}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base font-semibold text-flow-fg">{AI_SETTINGS_TITLE}</DialogTitle>
          <DialogDescription id={idFor("description")} className="text-xs leading-5 text-flow-muted">
            {AI_SETTINGS_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            close()
          }}
        >
          {shown.length > 1 ? (
            <div>
              <label htmlFor={idFor("provider")} className={ui.label}>
                Provedor de IA
              </label>
              <FlowSelect
                id={idFor("provider")}
                value={provider}
                onValueChange={changeProvider}
                options={providerOptions}
                aria-invalid={errors.provider ? true : undefined}
                aria-describedby={errors.provider ? idFor("provider-error") : undefined}
                className={errors.provider ? invalidField : undefined}
              />
              {errors.provider ? (
                <p id={idFor("provider-error")} className={ui.error}>
                  {errors.provider}
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label htmlFor={idFor("apiKey")} className={ui.label}>
              Chave da API {info.of}
            </label>
            <div className="relative">
              <input
                id={idFor("apiKey")}
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={changeKey}
                placeholder={info.keyPlaceholder}
                maxLength={LIMITS.apiKey}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                aria-invalid={errors.apiKey ? true : undefined}
                aria-describedby={describedBy(idFor("apiKey-hint"), warning && idFor("apiKey-warning"), errors.apiKey && idFor("apiKey-error"))}
                className={cn(ui.input, "pr-10 font-mono", fieldBase, errors.apiKey && invalidField)}
              />
              <button
                type="button"
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                aria-controls={idFor("apiKey")}
                title={showKey ? "Ocultar chave" : "Mostrar chave"}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
              >
                {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <p id={idFor("apiKey-hint")} className={ui.hint}>
              {aiKeyHint(info.of)}
            </p>
            {warning ? (
              <p id={idFor("apiKey-warning")} className={warningText}>
                {warning}
              </p>
            ) : null}
            {errors.apiKey ? (
              <p id={idFor("apiKey-error")} className={ui.error}>
                {errors.apiKey}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={idFor("model")} className={ui.label}>
              Modelo
            </label>
            <div className="flex items-center gap-2">
              <FlowSelect
                key={provider}
                id={idFor("model")}
                value={model}
                onValueChange={changeModel}
                placeholder="Selecione um modelo"
                options={modelOptions}
                aria-invalid={errors.model ? true : undefined}
                aria-describedby={describedBy(idFor("model-hint"), listingStatus && idFor("models-status"), errors.model && idFor("model-error"))}
                className={cn("min-w-0 flex-1", errors.model && invalidField)}
              />
              <button
                type="button"
                onClick={() => void fetchModels()}
                disabled={!apiKey.trim() || listingBusy}
                aria-label="Buscar modelos da API"
                title="Buscar modelos da API"
                aria-describedby={idFor("models-status")}
                className={cn(ui.button, "h-9 w-9 justify-center px-0")}
              >
                {listingBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p id={idFor("model-hint")} className={ui.hint}>
              ID {model}.{apiKey.trim() ? "" : " Informe a chave para buscar os modelos liberados na sua conta."}
            </p>
            <p id={idFor("models-status")} role="status" className={cn(ui.hint, !listingStatus && "sr-only")}>
              {listingStatus}
            </p>
            {providerListing?.state === "error" ? (
              <p role="alert" className={ui.error}>
                {[providerListing.error, providerListing.details].filter(Boolean).join(" ")}
              </p>
            ) : null}
            {errors.model ? (
              <p id={idFor("model-error")} className={ui.error}>
                {errors.model}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={idFor("effort")} className={ui.label}>
              Esforço
            </label>
            <FlowSelect
              id={idFor("effort")}
              value={effort}
              onValueChange={changeEffort}
              options={effortOptions}
              aria-invalid={errors.effort ? true : undefined}
              aria-describedby={describedBy(idFor("effort-hint"), errors.effort && idFor("effort-error"))}
              className={errors.effort ? invalidField : undefined}
            />
            <p id={idFor("effort-hint")} className={ui.hint}>
              {EFFORT_OPTIONS[effort].hint}
            </p>
            {errors.effort ? (
              <p id={idFor("effort-error")} className={ui.error}>
                {errors.effort}
              </p>
            ) : null}
          </div>

          <DialogFooter className="pt-1">
            <button type="submit" className={cn(ui.primaryButton, "h-9 justify-center px-4")}>
              {AI_SETTINGS_DONE}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
