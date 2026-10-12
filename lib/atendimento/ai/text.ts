export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

export function compactKey(value: string): string {
  return foldText(value).replace(/[^a-z0-9]/g, "")
}

export function quote(value: string): string {
  return `“${value}”`
}

export function listQuoted(values: readonly string[]): string {
  return values.map(quote).join(", ")
}

export function stripFences(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```[\w-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const source = stripFences(text)
  if (!source) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(source) }
  } catch {
    return { ok: false }
  }
}

export function sliceObject(text: string): string {
  const source = stripFences(text)
  const start = source.indexOf("{")
  const end = source.lastIndexOf("}")
  return start >= 0 && end > start ? source.slice(start, end + 1) : source
}

export function clip(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit)
}

export function shorten(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const space = cut.lastIndexOf(" ")
  return (space >= limit / 2 ? cut.slice(0, space) : cut).trim()
}
