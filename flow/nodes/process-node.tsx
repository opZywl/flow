"use client"

import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Cog } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ProcessNode({ data, onRemove }: { data: { label: string }; onRemove: () => void }) {
  return (
    <Card className="w-48 bg-gray-900 border border-yellow-500 shadow-lg">
      <CardHeader className="p-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-yellow-400 flex items-center">
          <Cog className="h-4 w-4 mr-2" /> {data.label || "Process"}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-white" onClick={onRemove}>
          <Cog className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Performs an action.</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-gray-400" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-400" />
    </Card>
  )
}
