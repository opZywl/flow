"use client"

import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Flag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { WorkflowNodeProps } from "../utils/types"
import { useState } from "react"

interface FinalizarNodeData {
  label?: string
  message?: string
  customId?: string
}

interface FinalizarNodeProps extends WorkflowNodeProps {
  data: FinalizarNodeData
  onRemove?: () => void
  onUpdateData?: (data: Partial<FinalizarNodeData>) => void
}

export function FinalizarNode({ id, data, onRemove }: FinalizarNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempMessage, setTempMessage] = useState(data.message || "")

  const handleSave = () => {
    if (onRemove) {
      onRemove(id)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempMessage(data.message || "")
    setIsEditing(false)
  }

  return (
    <Card className="w-64 bg-gray-900 border border-red-500 shadow-lg hover:shadow-red-500/20 transition-all">
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-gray-800/50">
        <CardTitle className="text-sm font-semibold text-red-400 flex items-center">
          <Flag className="h-4 w-4 mr-2" /> {data.label || "Finalizar"}
          {data.customId && (
            <span className="ml-2 text-xs bg-red-500/20 text-red-300 px-1 rounded">{data.customId}</span>
          )}
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
      <CardContent className="p-3">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={tempMessage}
              onChange={(e) => setTempMessage(e.target.value)}
              className="w-full h-20 text-xs bg-gray-800 border border-gray-600 rounded p-2 text-white resize-none"
              placeholder="Digite a mensagem final..."
            />
            <div className="flex gap-1">
              <button onClick={handleSave} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                Salvar
              </button>
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-gray-800 p-2 rounded transition-colors"
          >
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
              {data.message || "Clique para editar a mensagem final..."}
            </p>
          </div>
        )}
      </CardContent>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-yellow-400 border-2 border-gray-900" />
    </Card>
  )
}
