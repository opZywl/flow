"use client"
import { Handle, Position } from "reactflow"
import { GitBranch } from "lucide-react"

export function ConditionalNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-yellow-500 border-2 border-yellow-600 text-white min-w-[120px]">
      <div className="flex items-center">
        <GitBranch className="h-4 w-4 mr-2" />
        <div className="text-sm font-medium">{data.label}</div>
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-yellow-600 border-2 border-white" />
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="w-3 h-3 bg-yellow-600 border-2 border-white"
        style={{ left: "25%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="w-3 h-3 bg-yellow-600 border-2 border-white"
        style={{ left: "75%" }}
      />
    </div>
  )
}
