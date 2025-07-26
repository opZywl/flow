import type { Node } from "reactflow"

export interface Option {
  id: string
  text: string
}

export interface NodeData {
  label: string
  message?: string
  options?: Option[]
  code?: string
  customId?: string
}

export type WorkflowNode = Node<NodeData>

export interface WorkflowNodeProps {
  id: string
  data: NodeData
  onRemove: (id: string) => void
  onUpdateData: (id: string, data: Partial<NodeData>) => void
}
