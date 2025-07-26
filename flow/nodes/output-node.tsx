import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileOutputIcon as OutputIcon } from "lucide-react"

export function OutputNode({ data }: { data: { label: string } }) {
  return (
    <Card className="w-48 bg-gray-900 border border-purple-500 shadow-lg">
      <CardHeader className="p-3">
        <CardTitle className="text-sm font-semibold text-purple-400 flex items-center">
          <OutputIcon className="h-4 w-4 mr-2" /> {data.label || "Output"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Displays a result.</p>
      </CardContent>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-400" />
    </Card>
  )
}
