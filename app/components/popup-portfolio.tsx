"use client"

import * as React from "react"
import { ExternalLink, ChevronDown, Code2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"

export function PopupPortfolio() {
  const isMobile = useMobile()
  const [isMinimized, setIsMinimized] = React.useState(false)
  const [position, setPosition] = React.useState({ x: 20, y: 120 })
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)
  const moveTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  const clearTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current)
      moveTimerRef.current = null
    }
  }

  // Função para mover apenas pelas bordas da tela
  const moveToEdgePosition = () => {
    if (typeof window !== "undefined") {
      const margin = 20
      const avatarSize = 60
      const popupWidth = 320
      const popupHeight = 200
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight

      // Define as 4 bordas possíveis considerando o tamanho do popup expandido
      const edges = [
        // Borda superior
        {
          x: Math.random() * (screenWidth - popupWidth - margin * 2) + margin,
          y: margin,
        },
        // Borda direita
        {
          x: screenWidth - popupWidth - margin,
          y: Math.random() * (screenHeight - popupHeight - margin * 2) + margin,
        },
        // Borda inferior
        {
          x: Math.random() * (screenWidth - popupWidth - margin * 2) + margin,
          y: screenHeight - popupHeight - margin,
        },
        // Borda esquerda
        {
          x: margin,
          y: Math.random() * (screenHeight - popupHeight - margin * 2) + margin,
        },
      ]

      // Escolhe uma borda aleatória
      const randomEdge = edges[Math.floor(Math.random() * edges.length)]
      setPosition(randomEdge)
    }
  }

  // Ciclo de minimizar/expandir a cada 5 segundos
  React.useEffect(() => {
    if (!isMobile) {
      const toggleMinimized = () => {
        setIsMinimized((prev) => !prev)

        // Programa o próximo toggle
        timerRef.current = setTimeout(toggleMinimized, 5000) // 5 segundos
      }

      // Inicia o ciclo após 5 segundos
      timerRef.current = setTimeout(toggleMinimized, 5000)
    }

    return clearTimers
  }, [isMobile])

  // Movimento contínuo quando minimizado
  React.useEffect(() => {
    if (!isMobile && isMinimized) {
      const continuousMove = () => {
        moveToEdgePosition()
        moveTimerRef.current = setTimeout(continuousMove, 4000) // Move a cada 4 segundos quando minimizado
      }

      moveTimerRef.current = setTimeout(continuousMove, 2000) // Primeiro movimento após 2 segundos
    }

    return () => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current)
        moveTimerRef.current = null
      }
    }
  }, [isMobile, isMinimized])

  const handleToggleMinimized = () => {
    clearTimers()
    setIsMinimized((prev) => !prev)

    // Reinicia o ciclo automático após interação manual
    if (!isMobile) {
      timerRef.current = setTimeout(() => {
        const toggleMinimized = () => {
          setIsMinimized((prev) => !prev)
          timerRef.current = setTimeout(toggleMinimized, 5000)
        }

        timerRef.current = setTimeout(toggleMinimized, 5000)
      }, 5000)
    }
  }

  if (isMobile === undefined) {
    return <div className="fixed top-4 right-4 h-10 w-10 opacity-0 pointer-events-none" />
  }

  if (isMobile) {
    return null
  }

  if (isMinimized) {
    return (
        <div
            className="fixed z-50 cursor-pointer group transition-all duration-[2000ms] ease-in-out"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
            }}
            onClick={handleToggleMinimized}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleToggleMinimized()
            }}
            aria-label="Expandir popup do portfólio"
        >
          <div className="relative animate-bounce">
            <Avatar className="h-12 w-12 border-2 border-purple-500/50 shadow-lg group-hover:scale-110 transition-all duration-300 bg-gradient-to-r from-purple-900/80 to-cyan-900/80 backdrop-blur-sm">
              <AvatarFallback className="bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg">
                ¥$
              </AvatarFallback>
            </Avatar>
            <div className="absolute top-0 right-0 h-3.5 w-3.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 border-2 border-black z-10 animate-pulse" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-600/20 to-cyan-600/20 blur-md group-hover:blur-lg transition-all duration-300" />
          </div>
        </div>
    )
  }

  return (
      <Card
          className={cn(
              "fixed w-full max-w-[300px] sm:w-80 shadow-2xl z-50 backdrop-blur-md transition-all duration-[2000ms] ease-in-out",
              "bg-black/90 border border-gray-800/50",
              "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-purple-600/10 before:to-cyan-600/10 before:blur-sm",
          )}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transformOrigin: "top left",
          }}
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-cyan-600/20 rounded-lg blur opacity-75"></div>
        <div className="relative">
          <CardHeader className="flex flex-row items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Avatar className="h-12 w-12 border-2 border-purple-500/50 bg-gradient-to-r from-purple-900/50 to-cyan-900/50 backdrop-blur-sm">
                  <AvatarFallback className="bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg">
                    ¥$
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-600/20 to-cyan-600/20 blur-md" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent animate-pulse">
                  Lucas Lima
                </span>
                  <Code2 className="h-3 w-3 text-purple-400" />
                </p>
                <p className="text-xs text-gray-400 font-mono">Full Stack Developer</p>
              </div>
            </div>
            <div className="relative flex items-center">
              <div className="absolute top-[-4px] right-[8px] h-3 w-3 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 border-2 border-black z-10 animate-pulse" />
              <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-purple-900/30 transition-all duration-200"
                  onClick={handleToggleMinimized}
                  aria-label="Minimizar popup do portfólio"
              >
                <ChevronDown size={18} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm text-gray-300 mb-4 font-mono">
              Confira meu portfólio para ver mais projetos incríveis!
            </p>
            <div className="space-y-3">
              <Button
                  variant="outline"
                  className="w-full group relative overflow-hidden bg-transparent border-gray-700 hover:border-purple-500/50 text-white hover:text-white transition-all duration-300"
                  onClick={() => window.open("#", "_blank")}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-cyan-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <ExternalLink size={16} className="mr-2 group-hover:text-purple-400 transition-colors duration-200" />
                <span className="relative z-10">Ver Portfólio</span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/0 via-purple-600/5 to-cyan-600/0 group-hover:animate-pulse" />
              </Button>

              <Button
                  variant="outline"
                  className="w-full group relative overflow-hidden bg-transparent border-gray-700 hover:border-cyan-500/50 text-white hover:text-white transition-all duration-300"
                  onClick={() => window.open("https://discord.com/invite/3XRFGeqEYD", "_blank")}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Users size={16} className="mr-2 group-hover:text-cyan-400 transition-colors duration-200" />
                <span className="relative z-10">Acompanhar Comunidade</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/0 via-cyan-600/5 to-purple-600/0 group-hover:animate-pulse" />
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>
  )
}