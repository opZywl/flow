export interface NumberRule {
  integer: boolean
  min?: number
  max?: number
  step?: number
}

export function numberRule({ min, max, step }: { min?: number; max?: number; step?: number }): NumberRule {
  return { integer: step !== undefined && Number.isInteger(step), min, max, step }
}

export function numberMessage({ integer, min, max }: NumberRule): string {
  const kind = integer ? "um número inteiro" : "um número"
  if (min !== undefined && max !== undefined) return `Informe ${kind} de ${min} a ${max}.`
  if (min !== undefined) return `Informe ${kind} a partir de ${min}.`
  if (max !== undefined) return `Informe ${kind} até ${max}.`
  return `Informe ${kind}.`
}

export function parseNumber(text: string, { integer, min, max }: NumberRule): number | undefined {
  const trimmed = text.trim().replace(",", ".")
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) return undefined
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) return undefined
  return value
}

export function numericText(text: string, rule: NumberRule): boolean {
  const signed = rule.min === undefined || rule.min < 0
  return (rule.integer ? /^-?\d+$/ : /^-?\d+([.,]\d+)?$/).test(text) && (signed || !text.startsWith("-")) && parseNumber(text, rule) !== undefined
}

export function cleanNumberText(text: string, rule: NumberRule): string {
  const kept = text.replace(/[^\d.,-]/g, "")
  return rule.min === undefined || rule.min < 0 ? kept.replace(/(?!^)-/g, "") : kept.replace(/-/g, "")
}
