import type { ComponentDefinition, FieldSpec, JsonObject, JsonValue, Measured, NodeKind, OutputRule, OutputTone } from "./types"
import components from "./components.json"
import fieldTypes from "./field-types.json"
import templates from "./templates.json"

export const START_TYPE = "trigger_message"
export const START_ID = "inicio"
export const MENU_TYPE = "envio_mensagem"
export const NOTE_TYPE = "note"
export const TIME_TYPE = "timeConditions"
export const DEFAULT_NODE_TYPE: NodeKind = "custom"
export const API_TYPES: ReadonlySet<string> = new Set(["consulta_api", "solicitar_dados"])

export const categories = [
  { id: "messages", label: "Mensagens", color: "#b87900" },
  { id: "templates", label: "Templates", color: "#07856b" },
  { id: "routing", label: "Roteamento e transferência", color: "#358451" },
  { id: "schedule", label: "Agendamentos", color: "#7938df" },
  { id: "tickets", label: "Tickets", color: "#087fa9" },
  { id: "crm", label: "CRM", color: "#10843d" },
  { id: "livechat", label: "Livechat", color: "#138639" },
  { id: "control", label: "Controle de fluxo", color: "#db3046" },
  { id: "conditions", label: "Condições", color: "#075681" },
  { id: "ai", label: "Inteligência artificial (IA)", color: "#8b4bd3" },
  { id: "apis", label: "APIs", color: "#327e98" },
  { id: "collection", label: "Coleta de dados", color: "#b96900" },
] as const

export const weekDayOptions = [
  { value: "monday", label: "Seg" },
  { value: "tuesday", label: "Ter" },
  { value: "wednesday", label: "Qua" },
  { value: "thursday", label: "Qui" },
  { value: "friday", label: "Sex" },
  { value: "saturday", label: "Sáb" },
  { value: "sunday", label: "Dom" },
]

interface ComponentEntry {
  id: string
  nativeType: string
  nodeType: NodeKind
  label: string
  category: string
  icon: string
  defaults: JsonObject
  configured?: JsonObject
  outputs: number
  outputLabels: string[]
  outputTones: OutputTone[]
  outputRule?: OutputRule
  measured: Measured
  fields: FieldSpec[]
  summary: string[]
  technicalLabels?: Record<string, string>
  fieldTypePatterns?: Record<string, string[]>
}

const entries = components as unknown as ComponentEntry[]
const copy = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value))

const timeRuleShape: JsonObject = (entries.find((entry) => entry.nativeType === TIME_TYPE)?.defaults.timeRules as JsonObject[] | undefined)?.[0] ?? { id: "" }

export const newTimeRule = (id = `rule-${Date.now()}`): JsonObject => ({ ...copy(timeRuleShape), id })

const dynamicDefaults: Record<string, (data: JsonObject) => JsonObject> = {
  [TIME_TYPE]: (data) => ({ ...data, timeRules: [newTimeRule()] }),
}

function toDefinition(entry: ComponentEntry): ComponentDefinition {
  const { configured, outputRule, technicalLabels, fieldTypePatterns } = entry
  const build = dynamicDefaults[entry.nativeType]
  return {
    id: entry.id,
    label: entry.label,
    category: entry.category,
    nativeType: entry.nativeType,
    nodeType: entry.nodeType,
    icon: entry.icon,
    defaults: () => build ? build(copy(entry.defaults)) : copy(entry.defaults),
    ...(configured ? { configured: () => copy(configured) } : {}),
    outputs: entry.outputs,
    outputLabels: entry.outputLabels,
    outputTones: entry.outputTones,
    ...(outputRule ? { outputRule } : {}),
    measured: entry.measured,
    fields: entry.fields,
    summary: entry.summary,
    ...(technicalLabels ? { technicalLabels } : {}),
    ...(fieldTypePatterns ? { fieldTypePatterns } : {}),
  }
}

export const componentCatalog: ComponentDefinition[] = entries.map(toDefinition)
export const supportedComponents = componentCatalog.filter((entry) => entry.defaults)
export const pendingComponents = componentCatalog.filter((entry) => !entry.defaults)

const definitionByType = new Map<string, ComponentDefinition>(componentCatalog.map((entry) => [entry.nativeType ?? entry.id, entry]))
const definitionById = new Map<string, ComponentDefinition>(componentCatalog.map((entry) => [entry.id, entry]))
const categoryById = new Map<string, (typeof categories)[number]>(categories.map((category) => [category.id, category]))
const templateByType = new Map(Object.entries(templates as Record<string, string>))
const typesByField = new Map(Object.entries(fieldTypes as Record<string, Record<string, string[]>>).map(([type, fields]) => [type, new Map(Object.entries(fields))]))
const typePatterns = new Map(componentCatalog.map((entry) => [
  entry.nativeType ?? entry.id,
  Object.entries(entry.fieldTypePatterns ?? {}).map(([pattern, list]) => [new RegExp(pattern), list] as const),
]))

export const getDefinition = (type: string) => definitionByType.get(type)
export const getDefinitionById = (id: string) => definitionById.get(id)
export const getComponentLabel = (type: string) => getDefinition(type)?.label || type
export const getCategory = (type: string) => {
  const category = getDefinition(type)?.category
  return category === undefined ? undefined : categoryById.get(category)
}
export const getComponentColor = (type: string) => getCategory(type)?.color || "#64748b"
export const getTemplate = (type: string): string => templateByType.get(type) ?? ""
export const getNodeType = (type: string): NodeKind => getDefinition(type)?.nodeType ?? DEFAULT_NODE_TYPE
export const getIconName = (type: string): string | undefined => getDefinition(type)?.icon
export const defaultMeasured = (type: string): Measured => ({ ...(getDefinition(type)?.measured || { width: 260, height: 86 }) })

export const mirrorKeys = (field: Pick<FieldSpec, "mirror">): string[] =>
  field.mirror === undefined ? [] : Array.isArray(field.mirror) ? [...field.mirror] : [field.mirror]

export const outputTone = (type: string, index: number): OutputTone => {
  const tones = getDefinition(type)?.outputTones ?? []
  return tones[index] ?? tones[tones.length - 1] ?? "accent"
}

export const expectedFieldTypes = (type: string, key: string): string[] | undefined =>
  typesByField.get(type)?.get(key) ?? typePatterns.get(type)?.find(([pattern]) => pattern.test(key))?.[1]
