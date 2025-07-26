"use client"
import { Handle, Position } from "reactflow"
import { Play } from "lucide-react"

export function StartNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-green-500 border-2 border-green-600 text-white min-w-[120px]">
      <div className="flex items-center">
        <Play className="h-4 w-4 mr-2" />
        <div className="text-sm font-medium">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-600 border-2 border-white" />
    </div>
  )
}
