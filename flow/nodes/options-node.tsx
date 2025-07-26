"use client"

import { Handle, Position } from "reactflow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { List, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { WorkflowNodeProps, Option } from "../utils/types"
import { useState } from "react"

interface OptionsNodeData {
  label?: string
  message?: string
  options?: Option[]
  customId?: string
}

interface OptionsNodeProps {
  data: OptionsNodeData
  onRemove?: () => void
  onUpdateData?: (data: Partial<OptionsNodeData>) => void
}

export function OptionsNode({ id, data, onRemove }: WorkflowNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempMessage, setTempMessage] = useState(data.message || "")
  const [tempOptions, setTempOptions] = useState<Option[]>(
    data.options || [
      { id: "opt1", text: "Opção 1" },
      { id: "opt2", text: "Opção 2" },
    ],
  )

  const handleSave = () => {
    if (onRemove) {
      onRemove(id)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempMessage(data.message || "")
    setTempOptions(data.options || [])
    setIsEditing(false)
  }

  const addOption = () => {
    const newOption = {
      id: `opt${tempOptions.length + 1}`,
      text: `Opção ${tempOptions.length + 1}`,
    }
    setTempOptions([...tempOptions, newOption])
  }

  const removeOption = (index: number) => {
    if (tempOptions.length > 1) {
      setTempOptions(tempOptions.filter((_, i) => i !== index))
    }
  }

  const updateOption = (index: number, text: string) => {
    const updated = [...tempOptions]
    updated[index] = { ...updated[index], text }
    setTempOptions(updated)
  }

  const options = data.options || []

  return (
    <Card className="w-64 bg-gray-900 border border-indigo-500 shadow-lg">
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-gray-800/50">
        <CardTitle className="text-sm font-semibold text-indigo-400 flex items-center">
          <List className="h-4 w-4 mr-2" /> {data.label || "Options"}
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
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Mensagem:</label>
              <textarea
                value={tempMessage}
                onChange={(e) => setTempMessage(e.target.value)}
                className="w-full h-16 text-xs bg-gray-800 border border-gray-600 rounded p-2 text-white resize-none"
                placeholder="Digite a pergunta..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Opções:</label>
                <button onClick={addOption} className="text-indigo-400 hover:text-indigo-300 p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1">
                {tempOptions.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-1">
                    <input
                      value={option.text}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="flex-1 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
                      placeholder={`Opção ${index + 1}`}
                    />
                    {tempOptions.length > 1 && (
                      <button onClick={() => removeOption(index)} className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
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
            <p className="text-xs text-gray-300 mb-2">{data.message || "Clique para editar a pergunta..."}</p>
            <div className="space-y-1">
              {options.map((opt: Option, index: number) => (
                <div key={opt.id} className="flex items-center justify-between text-gray-400">
                  <span>
                    {index + 1}. {opt.text}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`output-${index}`}
                    style={{ top: `${70 + index * 20}px` }}
                    className="w-2 h-2 bg-green-400"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-yellow-400" />
    </Card>
  )
}
