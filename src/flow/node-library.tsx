"use client"

import type React from "react"
import { useState } from "react"
import {
  Send,
  List,
  Settings,
  GitBranch,
  Code,
  CheckCircle,
  MousePointer2,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from "lucide-react"
import { useTheme } from "../ThemeContext"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const nodeTypes = [
  {
    type: "sendMessage",
    label: "Enviar Mensagem",
    icon: Send,
    description: "Envia mensagem para o usuário",
  },
  {
    type: "options",
    label: "Opções",
    icon: List,
    description: "Apresenta opções ao usuário",
  },
  {
    type: "process",
    label: "Processo",
    icon: Settings,
    description: "Processa dados",
  },
  {
    type: "conditional",
    label: "Condicional",
    icon: GitBranch,
    description: "Ramificação condicional",
  },
  {
    type: "code",
    label: "Código",
    icon: Code,
    description: "Executa código personalizado",
  },
  {
    type: "finalizar",
    label: "Finalizar",
    icon: CheckCircle,
    description: "Finaliza o fluxo",
  },
]

export default function NodeLibrary() {
  const { theme, currentGradient, glowEnabled, glowIntensity, glowThickness } = useTheme()
  const [showHelpDialog, setShowHelpDialog] = useState(false)

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  const isDark = theme === "dark"

  // Generate glow styles based on current theme
  const getGlowStyle = (intensity = 1) => {
    if (!glowEnabled) return {}

    const baseIntensity = (glowIntensity / 100) * intensity
    const thickness = glowThickness * intensity

    return {
      filter: `drop-shadow(0 0 ${thickness}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.6}`)}) drop-shadow(0 0 ${thickness * 2}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.3}`)})`,
      textShadow: `0 0 ${thickness}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.8}`)}`,
    }
  }

  const getContainerGlowStyle = () => {
    if (!glowEnabled) return {}

    const baseIntensity = glowIntensity / 100
    const thickness = glowThickness

    return {
      boxShadow: `
        0 0 ${thickness}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.4}`)},
        0 0 ${thickness * 2}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.2}`)},
        0 0 ${thickness * 3}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.1}`)},
        inset 0 0 ${thickness}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.05}`)}
      `,
      border: `1px solid ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.6}`)}`,
    }
  }

  const getHoverGlowStyle = () => {
    if (!glowEnabled) return {}

    const baseIntensity = glowIntensity / 100
    const thickness = glowThickness

    return {
      boxShadow: `0 0 ${thickness}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.4}`)}, 0 0 ${thickness * 2}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.2}`)}, inset 0 0 ${thickness / 2}px ${currentGradient.glow.replace("0.6", `${baseIntensity * 0.1}`)}`,
      borderColor: currentGradient.glow.replace("0.6", `${baseIntensity * 0.6}`),
    }
  }

  const handleHelpClick = () => {
    setShowHelpDialog(true)
  }

  const handleGitHubRedirect = () => {
    window.open("https://github.com/opZywl/workflow/issues", "_blank")
    setShowHelpDialog(false)
  }

  return (
      <>
        <div
            className="h-full flex flex-col relative overflow-hidden rounded-xl"
            style={{
              background: `linear-gradient(135deg, 
            ${isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.4)"} 0%, 
            ${isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.2)"} 50%, 
            ${isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.4)"} 100%
          )`,
              backdropFilter: "blur(20px)",
              ...getContainerGlowStyle(),
            }}
        >
          {/* Animated Background Gradient */}
          <div
              className="absolute inset-0 opacity-10 animate-pulse rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                filter: "blur(40px)",
              }}
          />

          {/* Header */}
          <div className="relative z-10 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                    className="p-2 rounded-xl transition-all duration-300"
                    style={{
                      background: `linear-gradient(135deg, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                      ...getGlowStyle(0.8),
                    }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`} style={getGlowStyle(0.6)}>
                  Componentes
                </h3>
              </div>
              <MousePointer2
                  className={`h-4 w-4 ${isDark ? "text-gray-400" : "text-gray-600"} animate-pulse`}
                  style={getGlowStyle(0.3)}
              />
            </div>

            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"} font-medium`} style={getGlowStyle(0.2)}>
              Arraste os componentes para o canvas
            </p>
          </div>

          {/* Components List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 relative z-10">
            <div className="space-y-2">
              {nodeTypes.map((node, index) => {
                const IconComponent = node.icon
                return (
                    <div
                        key={node.type}
                        className={`group px-4 py-3 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-300 relative overflow-hidden`}
                        style={{
                          background: `linear-gradient(135deg, 
                      ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 0%, 
                      ${isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)"} 50%, 
                      ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 100%
                    )`,
                          border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}`,
                          animationDelay: `${index * 100}ms`,
                          backdropFilter: "blur(10px)",
                        }}
                        onMouseEnter={(e) => {
                          const hoverStyle = getHoverGlowStyle()
                          Object.assign(e.currentTarget.style, {
                            ...hoverStyle,
                            background: `linear-gradient(135deg, 
                        ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"} 0%, 
                        ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 50%, 
                        ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"} 100%
                      )`,
                            transform: "translateY(-2px) scale(1.02)",
                          })
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = ""
                          e.currentTarget.style.background = `linear-gradient(135deg, 
                      ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 0%, 
                      ${isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)"} 50%, 
                      ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 100%
                    )`
                          e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
                          e.currentTarget.style.transform = "translateY(0) scale(1)"
                        }}
                        draggable
                        onDragStart={(event) => onDragStart(event, node.type)}
                    >
                      {/* Hover gradient overlay */}
                      <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300 rounded-xl"
                          style={{
                            background: `linear-gradient(135deg, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                          }}
                      />

                      <div className="relative z-10 flex items-center gap-4">
                        <div
                            className="p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110"
                            style={{
                              background: `linear-gradient(135deg, ${currentGradient.secondary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                              ...getGlowStyle(0.4),
                            }}
                        >
                          <IconComponent className="h-4 w-4 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div
                              className={`text-sm font-semibold mb-1 ${isDark ? "text-white" : "text-gray-900"} group-hover:text-white transition-colors duration-300`}
                              style={getGlowStyle(0.3)}
                          >
                            {node.label}
                          </div>
                          <div
                              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} group-hover:text-gray-200 transition-colors duration-300 truncate`}
                              style={getGlowStyle(0.2)}
                          >
                            {node.description}
                          </div>
                        </div>

                        {/* Drag indicator */}
                        <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-80 transition-all duration-300">
                          <div
                              className={`w-1 h-1 rounded-full ${isDark ? "bg-white" : "bg-gray-600"}`}
                              style={getGlowStyle(0.2)}
                          />
                          <div
                              className={`w-1 h-1 rounded-full ${isDark ? "bg-white" : "bg-gray-600"}`}
                              style={getGlowStyle(0.2)}
                          />
                          <div
                              className={`w-1 h-1 rounded-full ${isDark ? "bg-white" : "bg-gray-600"}`}
                              style={getGlowStyle(0.2)}
                          />
                        </div>
                      </div>
                    </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 px-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    background: currentGradient.primary,
                    ...getGlowStyle(0.6),
                  }}
              />
              <button
                  onClick={handleHelpClick}
                  className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-gray-900"} font-semibold transition-all duration-300 hover:scale-105 px-3 py-2 rounded-lg`}
                  style={{
                    ...getGlowStyle(0.2),
                    background: `linear-gradient(135deg, 
                  ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 0%, 
                  ${isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)"} 100%
                )`,
                    border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}`,
                    backdropFilter: "blur(10px)",
                  }}
                  onMouseEnter={(e) => {
                    const hoverStyle = getHoverGlowStyle()
                    Object.assign(e.currentTarget.style, hoverStyle)
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = ""
                    e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
                  }}
              >
                <HelpCircle className="h-4 w-4" />
                Precisa de ajuda?
              </button>
              <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    background: currentGradient.primary,
                    ...getGlowStyle(0.6),
                    animationDelay: "1s",
                  }}
              />
            </div>
          </div>
        </div>

        {/* Help Dialog */}
        <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
          <DialogContent
              className={`max-w-md mx-auto rounded-xl border-0`}
              style={{
                background: `linear-gradient(135deg, 
              ${isDark ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.9)"} 0%, 
              ${currentGradient.primary}15 50%, 
              ${isDark ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.9)"} 100%
            )`,
                backdropFilter: "blur(20px)",
                ...getContainerGlowStyle(),
              }}
          >
            <DialogHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <div
                    className="p-4 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                      ...getGlowStyle(0.8),
                    }}
                >
                  <HelpCircle className="h-6 w-6 text-white" />
                </div>
              </div>
              <DialogTitle
                  className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"} mb-2`}
                  style={getGlowStyle(0.5)}
              >
                Precisa de algum componente?
              </DialogTitle>
              <DialogDescription
                  className={`${isDark ? "text-gray-300" : "text-gray-600"} text-sm`}
                  style={getGlowStyle(0.2)}
              >
                Não encontrou o componente que precisa? Sugira novos componentes para o workflow!
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-4">
              <div
                  className={`p-4 rounded-xl border`}
                  style={{
                    background: `linear-gradient(135deg, 
                  ${isDark ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.05)"} 0%, 
                  ${isDark ? "rgba(59, 130, 246, 0.05)" : "rgba(59, 130, 246, 0.02)"} 100%
                )`,
                    border: `1px solid ${isDark ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.2)"}`,
                    backdropFilter: "blur(10px)",
                  }}
              >
                <p
                    className={`text-sm font-semibold mb-3 ${isDark ? "text-blue-300" : "text-blue-700"}`}
                    style={getGlowStyle(0.3)}
                >
                  Como sugerir um componente:
                </p>
                <ul className={`text-xs space-y-2 ${isDark ? "text-blue-200" : "text-blue-600"}`}>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-current" />
                    Descreva o tipo de componente
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-current" />
                    Explique como ele funcionaria
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-current" />
                    Dê exemplos de uso
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-8">
              <Button
                  onClick={() => setShowHelpDialog(false)}
                  variant="outline"
                  className={`px-6 py-2 rounded-xl font-semibold transition-all duration-300`}
                  style={{
                    background: `linear-gradient(135deg, 
                  ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"} 0%, 
                  ${isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} 100%
                )`,
                    border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"}`,
                    color: isDark ? "white" : "black",
                    backdropFilter: "blur(10px)",
                  }}
              >
                Cancelar
              </Button>
              <Button
                  onClick={handleGitHubRedirect}
                  className={`flex items-center gap-2 font-semibold px-6 py-2 rounded-xl transition-all duration-300 hover:scale-105`}
                  style={{
                    background: `linear-gradient(135deg, ${currentGradient.primary.replace("linear-gradient(135deg, ", "").replace(")", "")})`,
                    color: "white",
                    border: "none",
                    ...getGlowStyle(0.4),
                  }}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir GitHub Issues
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
  )
}
