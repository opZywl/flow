"use client"

import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ConditionalNode({ data, onRemove }: { data: { label: string }; onRemove: () => void }) {
  return (
    <Card className="w-48 bg-gray-900 border border-orange-500 shadow-lg">
      <CardHeader className="p-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-orange-400 flex items-center">
          <GitBranch className="h-4 w-4 mr-2" /> {data.label || "Conditional"}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-white" onClick={onRemove}>
          <GitBranch className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Branches the flow.</p>
      </CardContent>
      <Handle
        type="source"
        id="true"
        position={Position.Right}
        style={{ top: "33%" }}
        className="w-2 h-2 bg-green-500"
      />
      <Handle
        type="source"
        id="false"
        position={Position.Right}
        style={{ top: "66%" }}
        className="w-2 h-2 bg-red-500"
      />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-400" />
    </Card>
  )
}
