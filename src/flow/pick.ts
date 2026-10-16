export interface PickHandlers {
  onSelect: (id: string | null) => void
  onConfirm: (id: string) => void
  onCancel: () => void
}

export interface PickRequest extends PickHandlers {
  label: string
  candidates: string[]
  selected: string | null
  any?: boolean
}

export interface CanvasPick {
  start: (request: PickRequest) => string[]
  select: (id: string | null) => void
  confirm: () => void
  end: () => void
}
