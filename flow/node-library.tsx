"use client"

import type React from "react"

import { MessageSquare, List, Code, Flag, GitBranch, Cog, Bot } from "lucide-react"

const NodeItem = ({ type, label, icon: Icon }: { type: string; label: string; icon: React.ElementType }) => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <div
      className="flex items-center p-2 mb-2 rounded-md border border-gray-700 bg-gray-800/50 cursor-grab hover:bg-gray-700 transition-colors"
      onDragStart={(event) => onDragStart(event, type)}
      draggable
    >
      <Icon className="h-5 w-5 mr-3 text-gray-400" />
      <span className="text-sm text-white">{label}</span>
    </div>
  )
}

export function NodeLibrary() {
  return (
    <div>
      <NodeItem type="sendMessage" label="Enviar Mensagem" icon={MessageSquare} />
      <NodeItem type="options" label="Opções" icon={List} />
      <NodeItem type="code" label="Executar Código" icon={Code} />
      <NodeItem type="finalizar" label="Finalizar" icon={Flag} />
      <NodeItem type="conditional" label="Condicional" icon={GitBranch} />
      <NodeItem type="process" label="Processo" icon={Cog} />
      <NodeItem type="bot" label="Bot" icon={Bot} />
    </div>
  )
}
