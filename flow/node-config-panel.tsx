"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { X, Plus, Trash2 } from "lucide-react"
import type { WorkflowNode, Option } from "./utils/types"

interface NodeConfigPanelProps {
  node: WorkflowNode
  updateNodeData: (nodeId: string, data: any) => void
  onClose: () => void
  onRemove: () => void
}

export function NodeConfigPanel({ node, updateNodeData, onClose, onRemove }: NodeConfigPanelProps) {
  const handleDataChange = (key: string, value: any) => {
    updateNodeData(node.id, { ...node.data, [key]: value })
  }

  const handleOptionChange = (index: number, newText: string) => {
    const newOptions = [...(node.data.options || [])]
    newOptions[index] = { ...newOptions[index], text: newText }
    handleDataChange("options", newOptions)
  }

  const addOption = () => {
    const newOptions = [...(node.data.options || []), { id: `opt${Date.now()}`, text: "Nova Opção" }]
    handleDataChange("options", newOptions)
  }

  const removeOption = (index: number) => {
    const newOptions = (node.data.options || []).filter((_: any, i: number) => i !== index)
    handleDataChange("options", newOptions)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white">Configurar Nó</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-grow p-4 space-y-4 overflow-y-auto">
        <div>
          <Label htmlFor="label" className="text-gray-400">
            Rótulo
          </Label>
          <Input
            id="label"
            value={node.data.label || ""}
            onChange={(e) => handleDataChange("label", e.target.value)}
            className="bg-gray-800 border-gray-600 text-white"
          />
        </div>
        {node.type === "sendMessage" || node.type === "options" || node.type === "finalizar" ? (
          <div>
            <Label htmlFor="message" className="text-gray-400">
              Mensagem
            </Label>
            <Textarea
              id="message"
              value={node.data.message || ""}
              onChange={(e) => handleDataChange("message", e.target.value)}
              className="bg-gray-800 border-gray-600 text-white"
              rows={4}
            />
          </div>
        ) : null}
        {node.type === "options" && (
          <div className="space-y-2">
            <Label className="text-gray-400">Opções</Label>
            {(node.data.options || []).map((option: Option, index: number) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Input
                  value={option.text}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(index)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              onClick={addOption}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent"
            >
              <Plus className="h-4 w-4 mr-2" /> Adicionar Opção
            </Button>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-700">
        <Button onClick={onRemove} variant="destructive" className="w-full">
          <Trash2 className="h-4 w-4 mr-2" /> Remover Nó
        </Button>
      </div>
    </div>
  )
}
