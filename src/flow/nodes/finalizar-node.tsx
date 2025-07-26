"use client"
import { Handle, Position } from "reactflow"
import { Square } from "lucide-react"

export function FinalizarNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-gray-500 border-2 border-gray-600 text-white min-w-[120px]">
      <div className="flex items-center">
        <Square className="h-4 w-4 mr-2" />
        <div className="text-sm font-medium">{data.label}</div>
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-600 border-2 border-white" />
    </div>
  )
}
