import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileInputIcon as InputIcon } from "lucide-react"

export function InputNode({ data }: { data: { label: string } }) {
  return (
    <Card className="w-48 bg-gray-900 border border-blue-500 shadow-lg">
      <CardHeader className="p-3">
        <CardTitle className="text-sm font-semibold text-blue-400 flex items-center">
          <InputIcon className="h-4 w-4 mr-2" /> {data.label || "Input"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 text-xs text-gray-300">
        <p>Receives user input.</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-gray-400" />
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-400" />
    </Card>
  )
}
