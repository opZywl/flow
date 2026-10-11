"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Code2, ExternalLink, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"

const PORTFOLIO_URL = "https://lucas-lima.xyz"
const COMMUNITY_URL = "https://discord.com/invite/3XRFGeqEYD"
const AUTO_TOGGLE_MS = 5000
const RESUME_AFTER_INTERACTION_MS = 10000
const FIRST_MOVE_MS = 2000
const MOVE_INTERVAL_MS = 4000
const EDGE_MARGIN = 20
const POPUP_WIDTH = 320
const POPUP_HEIGHT = 200

function randomEdgePosition() {
  const width = window.innerWidth
  const height = window.innerHeight
  const randomX = () => Math.random() * (width - POPUP_WIDTH - EDGE_MARGIN * 2) + EDGE_MARGIN
  const randomY = () => Math.random() * (height - POPUP_HEIGHT - EDGE_MARGIN * 2) + EDGE_MARGIN
  const edges = [
    { x: randomX(), y: EDGE_MARGIN },
    { x: width - POPUP_WIDTH - EDGE_MARGIN, y: randomY() },
    { x: randomX(), y: height - POPUP_HEIGHT - EDGE_MARGIN },
    { x: EDGE_MARGIN, y: randomY() },
  ]
  return edges[Math.floor(Math.random() * edges.length)]
}

export function PopupPortfolio() {
  const isMobile = useMobile()
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 120 })
  const [cycle, setCycle] = useState({ delay: AUTO_TOGGLE_MS })

  useEffect(() => {
    if (isMobile) return
    let timer = setTimeout(function toggle() {
      setIsMinimized((previous) => !previous)
      timer = setTimeout(toggle, AUTO_TOGGLE_MS)
    }, cycle.delay)
    return () => clearTimeout(timer)
  }, [isMobile, cycle])

  useEffect(() => {
    if (isMobile || !isMinimized) return
    let timer = setTimeout(function move() {
      setPosition(randomEdgePosition())
      timer = setTimeout(move, MOVE_INTERVAL_MS)
    }, FIRST_MOVE_MS)
    return () => clearTimeout(timer)
  }, [isMobile, isMinimized])

  const handleToggle = () => {
    setIsMinimized((previous) => !previous)
    setCycle({ delay: RESUME_AFTER_INTERACTION_MS })
  }

  if (isMobile) return null

  const placement = { left: `${position.x}px`, top: `${position.y}px` }

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Mostrar portfólio"
        className="group fixed z-50 cursor-pointer transition-all ease-in-out [transition-duration:2000ms]"
        style={placement}
      >
        <span className="relative block animate-bounce">
          <Avatar className="h-12 w-12 border-2 border-purple-500/50 bg-gradient-to-r from-purple-900/80 to-cyan-900/80 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover:scale-110">
            <AvatarFallback className="bg-gradient-to-r from-purple-600 to-cyan-600 text-lg font-bold text-white">¥$</AvatarFallback>
          </Avatar>
          <span className="absolute right-0 top-0 z-10 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-black bg-gradient-to-r from-purple-400 to-cyan-400" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-600/20 to-cyan-600/20 blur-md transition-all duration-300 group-hover:blur-lg" />
        </span>
      </button>
    )
  }

  return (
    <Card
      className={cn(
        "fixed z-50 w-full max-w-[300px] shadow-2xl backdrop-blur-md transition-all ease-in-out [transition-duration:2000ms] sm:w-80",
        "border border-gray-800/50 bg-black/90",
        "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-purple-600/10 before:to-cyan-600/10 before:blur-sm",
      )}
      style={{ ...placement, transformOrigin: "top left" }}
    >
      <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-purple-600/20 to-cyan-600/20 opacity-75 blur" aria-hidden="true" />
      <div className="relative">
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar className="h-12 w-12 border-2 border-purple-500/50 bg-gradient-to-r from-purple-900/50 to-cyan-900/50 backdrop-blur-sm">
                <AvatarFallback className="bg-gradient-to-r from-purple-600 to-cyan-600 text-lg font-bold text-white">¥$</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-600/20 to-cyan-600/20 blur-md" aria-hidden="true" />
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="animate-pulse bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">Lucas Lima</span>
                <Code2 className="h-3 w-3 text-purple-400" aria-hidden="true" />
              </p>
              <p className="font-mono text-xs text-gray-400">Desenvolvedor full stack</p>
            </div>
          </div>
          <div className="relative flex items-center">
            <div
              className="absolute right-[8px] top-[-4px] z-10 h-3 w-3 animate-pulse rounded-full border-2 border-black bg-gradient-to-r from-purple-400 to-cyan-400"
              aria-hidden="true"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 transition-all duration-200 hover:bg-purple-900/30 hover:text-white"
              onClick={handleToggle}
              aria-label="Minimizar portfólio"
            >
              <ChevronDown size={18} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="mb-4 font-mono text-sm text-gray-300">Conheça outros projetos no meu portfólio.</p>
          <div className="space-y-3">
            <Button
              asChild
              variant="outline"
              className="group relative w-full overflow-hidden border-gray-700 bg-transparent text-white transition-all duration-300 hover:border-purple-500/50 hover:text-white"
            >
              <a href={PORTFOLIO_URL} target="_blank" rel="noreferrer">
                <span
                  className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-cyan-600/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden="true"
                />
                <ExternalLink size={16} className="mr-2 transition-colors duration-200 group-hover:text-purple-400" aria-hidden="true" />
                <span className="relative z-10">Ver portfólio</span>
                <span
                  className="absolute inset-0 bg-gradient-to-r from-purple-600/0 via-purple-600/5 to-cyan-600/0 group-hover:animate-pulse"
                  aria-hidden="true"
                />
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              className="group relative w-full overflow-hidden border-gray-700 bg-transparent text-white transition-all duration-300 hover:border-cyan-500/50 hover:text-white"
            >
              <a href={COMMUNITY_URL} target="_blank" rel="noreferrer">
                <span
                  className="absolute inset-0 bg-gradient-to-r from-cyan-600/10 to-purple-600/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden="true"
                />
                <Users size={16} className="mr-2 transition-colors duration-200 group-hover:text-cyan-400" aria-hidden="true" />
                <span className="relative z-10">Comunidade no Discord</span>
                <span
                  className="absolute inset-0 bg-gradient-to-r from-cyan-600/0 via-cyan-600/5 to-purple-600/0 group-hover:animate-pulse"
                  aria-hidden="true"
                />
              </a>
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}
