"use client"

import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Code, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { WorkflowNodeProps } from "../utils/types"

export function CodeNode({ id, data, onRemove }: WorkflowNodeProps) {
  return (
    <Card className="w-64 bg-gray-900 border border-purple-500 shadow-lg">
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-gray-800/50">
        <CardTitle className="text-sm font-semibold text-purple-400 flex items-center">
          <Code className="h-4 w-4 mr-2" /> {data.label || "Execute Code"}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-gray-400 hover:text-white"
          onClick={() => onRemove(id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Executes a script.</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-green-400" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-yellow-400" />
    </Card>
  )
}
