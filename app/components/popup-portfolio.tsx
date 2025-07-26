"use client"

import * as React from "react"
import { ExternalLink, ChevronDown, Code2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"

export function PopupPortfolio() {
  const isMobile = useMobile()
  const [isDesktopMinimized, setIsDesktopMinimized] = React.useState(false)
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleDesktopToggleMinimize = () => {
    clearTimer()
    setIsDesktopMinimized((prev) => !prev)
  }

  React.useEffect(() => {
    if (isDesktopMinimized && !isMobile) {
      timerRef.current = setTimeout(() => {
        if (!isMobile) {
          setIsDesktopMinimized(false)
        }
      }, 3000)
    } else {
      clearTimer()
    }
    return clearTimer
  }, [isDesktopMinimized, isMobile])

  if (isMobile === undefined) {
    // Placeholder para evitar layout shift inicial
    return <div className="fixed top-4 right-4 h-10 w-10 opacity-0 pointer-events-none" />
  }

  if (isMobile) {
    return null
  }

  if (isDesktopMinimized) {
    return (
      <div
        className="fixed top-4 right-4 z-50 cursor-pointer group" // Posição ajustada para o topo
        onClick={handleDesktopToggleMinimize}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleDesktopToggleMinimize()
        }}
        aria-label="Expandir popup do portfólio"
      >
        <div className="relative">
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
        "fixed top-4 right-4 w-full max-w-[300px] sm:w-80 shadow-2xl z-50 backdrop-blur-md", // Posição ajustada para o topo
        "bg-black/90 border border-gray-800/50",
        "transition-all duration-300 ease-out",
        "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-purple-600/10 before:to-cyan-600/10 before:blur-sm",
      )}
      style={{ transformOrigin: "top right" }} // Origem da transformação ajustada
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
                Lucas Lima
                <Code2 className="h-3 w-3 text-purple-400" />
              </p>
              <p className="text-xs text-gray-400 font-mono">ASP.NET Developer</p>
            </div>
          </div>
          <div className="relative flex items-center">
            <div className="absolute top-[-4px] right-[8px] h-3 w-3 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 border-2 border-black z-10 animate-pulse" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-purple-900/30 transition-all duration-200"
              onClick={handleDesktopToggleMinimize}
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
        </CardContent>
      </div>
    </Card>
  )
}
