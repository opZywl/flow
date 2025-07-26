"use client"

import type React from "react"
import { memo, useState, useEffect } from "react"
import { Handle, Position } from "reactflow"
import { List, Plus, Minus, X } from "lucide-react"

interface OptionsNodeProps extends React.ComponentPropsWithoutRef<"div"> {
  data: any
}

export const OptionsNode = memo(({ data }: OptionsNodeProps) => {
  const [options, setOptions] = useState(data.options || [{ text: "Opção 1", digit: "1" }])
  const [message, setMessage] = useState(data.message || "digita a mensagem")

  // Sincronizar com dados externos
  useEffect(() => {
    if (data.options) {
      setOptions(data.options)
    }
    if (data.message) {
      setMessage(data.message)
    }
  }, [data.options, data.message])

  const addOption = () => {
    const newOptions = [...options, { text: `Opção ${options.length + 1}`, digit: `${options.length + 1}` }]
    setOptions(newOptions)
  }

  const removeOption = (index: number) => {
    if (options.length > 1) {
      const newOptions = options.filter((_, i) => i !== index)
      setOptions(newOptions)
    }
  }

  const updateOption = (index: number, field: string, value: string) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    setOptions(newOptions)
  }

  const updateMessage = (newMessage: string) => {
    setMessage(newMessage)
  }

  // Calcular altura dinâmica baseada no número de opções
  const nodeHeight = Math.max(300, 200 + options.length * 35)
  const hasMany = options.length > 5

  return (
    <div
      className="px-4 py-3 shadow-md rounded-lg bg-cyan-500 border-2 border-cyan-600 min-w-[280px] max-w-[320px] relative group text-white"
      style={{ minHeight: `${nodeHeight}px` }}
    >
      {/* Ícone de excluir */}
      <button
        onClick={(e) => e.stopPropagation()}
        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <X className="h-3 w-3" />
      </button>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="rounded-full w-6 h-6 flex items-center justify-center bg-cyan-100 text-cyan-600">
            <List className="h-3 w-3" />
          </div>
          <div className="ml-2">
            <div className="text-sm font-bold">{data.label}</div>
          </div>
        </div>
      </div>

      <div className="text-xs text-orange-400 mb-2 font-medium">Dicas dos botões</div>
      <div className="text-xs text-gray-300 mb-2 leading-relaxed">
        A mensagem pode ter até 1024 caracteres. Compatível com emojis e formatação de texto, assim como links.
      </div>
      <div className="text-xs text-gray-300 mb-3 leading-relaxed">
        Você pode ter até 3 botões, acima de 3 será gerado uma lista de botões que deve possuir no máximo de 10
        elementos na lista.
      </div>

      {/* Área de texto */}
      <div className="relative mb-3">
        <textarea
          value={message}
          onChange={(e) => updateMessage(e.target.value)}
          className="w-full bg-gray-900 border border-gray-600 rounded p-2 min-h-[100px] text-xs text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
          placeholder="digita a mensagem"
        />
      </div>

      {/* Tabela de opções com layout melhorado */}
      <div className="space-y-1 mb-3">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <input
              type="text"
              value={option.digit || ""}
              onChange={(e) => updateOption(index, "digit", e.target.value)}
              className="w-8 p-1 border border-gray-600 rounded bg-gray-900 text-white text-center text-xs"
              placeholder={`${index + 1}`}
            />
            <input
              type="text"
              value={option.text}
              onChange={(e) => updateOption(index, "text", e.target.value)}
              className="flex-1 p-1 border border-gray-600 rounded bg-gray-900 text-white text-xs"
              placeholder="seu texto"
            />
            {index === 0 ? (
              <button
                onClick={addOption}
                className="w-6 h-6 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600"
              >
                <Plus className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={() => removeOption(index)}
                className="w-6 h-6 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600"
              >
                <Minus className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* PONTO AMARELO DE ENTRADA */}
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-cyan-600 border-2 border-white" />

      {/* Múltiplas saídas VERDES - layout melhorado para muitas opções */}
      {options.map((_, index) => {
        let topPosition: string

        if (hasMany) {
          // Para muitas opções, distribuir uniformemente na lateral direita
          const startPercent = 25
          const endPercent = 85
          const step = (endPercent - startPercent) / Math.max(1, options.length - 1)
          topPosition = `${startPercent + index * step}%`
        } else {
          // Para poucas opções, usar posicionamento original
          topPosition = `${40 + index * 15}%`
        }

        return (
          <Handle
            key={`output-${index}`}
            type="source"
            position={Position.Right}
            id={`output-${index}`}
            style={{ top: topPosition }}
            className="w-3 h-3 bg-cyan-600 border-2 border-white"
          />
        )
      })}
    </div>
  )
})

OptionsNode.displayName = "OptionsNode"
