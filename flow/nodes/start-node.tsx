import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play } from "lucide-react"

interface StartNodeData {
  label?: string
}

interface StartNodeProps {
  data: StartNodeData
}

export function StartNode({ data }: StartNodeProps) {
  return (
    <Card className="w-48 bg-gray-900 border border-green-500 shadow-lg">
      <CardHeader className="p-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-green-400 flex items-center">
          <Play className="h-4 w-4 mr-2" /> {data.label || "Start"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Workflow entry point</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-gray-400" />
    </Card>
  )
}
