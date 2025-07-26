"use client"
import { Handle, Position } from "reactflow"
import { Settings } from "lucide-react"

export function ProcessNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-purple-500 border-2 border-purple-600 text-white min-w-[120px]">
      <div className="flex items-center">
        <Settings className="h-4 w-4 mr-2" />
        <div className="text-sm font-medium">{data.label}</div>
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-600 border-2 border-white" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-purple-600 border-2 border-white" />
    </div>
  )
}
