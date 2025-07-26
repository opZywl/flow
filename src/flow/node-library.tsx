"use client"

import type React from "react"
import { Play, MessageSquare, Settings, Send, GitBranch, Code, List, Square, ArrowRight } from "lucide-react"

const nodeCategories = [
  {
    title: "Basic Nodes",
    nodes: [
      { type: "startNode", label: "Start", icon: Play, color: "text-green-400" },
      { type: "inputNode", label: "Input", icon: MessageSquare, color: "text-blue-400" },
      { type: "processNode", label: "Process", icon: Settings, color: "text-purple-400" },
      { type: "outputNode", label: "Output", icon: Send, color: "text-orange-400" },
    ],
  },
  {
    title: "Logic Nodes",
    nodes: [
      { type: "conditionalNode", label: "Conditional", icon: GitBranch, color: "text-yellow-400" },
      { type: "codeNode", label: "Code", icon: Code, color: "text-red-400" },
      { type: "optionsNode", label: "Options", icon: List, color: "text-cyan-400" },
    ],
  },
  {
    title: "Communication",
    nodes: [
      { type: "sendMessageNode", label: "Send Message", icon: ArrowRight, color: "text-indigo-400" },
      { type: "finalizarNode", label: "Finalizar", icon: Square, color: "text-gray-400" },
    ],
  },
]

export function NodeLibrary() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4 text-white">Node Library</h2>

      {nodeCategories.map((category) => (
        <div key={category.title} className="mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-3">{category.title}</h3>
          <div className="space-y-2">
            {category.nodes.map((node) => (
              <div
                key={node.type}
                className="flex items-center p-3 bg-gray-700 rounded-lg cursor-grab hover:bg-gray-600 transition-colors"
                draggable
                onDragStart={(event) => onDragStart(event, node.type)}
              >
                <node.icon className={`h-4 w-4 mr-3 ${node.color}`} />
                <span className="text-sm text-white">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-8 p-3 bg-gray-700 rounded-lg">
        <p className="text-xs text-gray-400">Drag and drop nodes onto the canvas to build your workflow.</p>
      </div>
    </div>
  )
}
