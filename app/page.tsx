"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ExternalLink,
  Cpu,
  Layers,
  Workflow,
  Hexagon,
  GitBranch,
  Box,
  DockIcon as Docker,
  Cloud,
  HardDrive,
  MessageSquare,
  Smartphone,
  Monitor,
  Database,
  Play,
  Sparkles,
} from "lucide-react"
import { MouseTrailEffect } from "./components/mouse-trail-effect"
import { PopupPortfolio } from "./components/popup-portfolio"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function Home() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <MouseTrailEffect />
      <PopupPortfolio />
      <main className="flex-1">
        <section className="container mx-auto px-6 py-24 md:py-32 flex flex-col items-center justify-center min-h-[80vh] relative overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-20 left-10 w-24 h-24 rounded-full bg-purple-900/10 blur-xl"></div>
          <div className="absolute bottom-20 right-10 w-32 h-32 rounded-full bg-cyan-900/10 blur-xl"></div>
          <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-purple-400 rounded-full"></div>
          <div className="absolute top-2/3 left-1/3 w-2 h-2 bg-cyan-400 rounded-full"></div>
          <div className="absolute bottom-1/4 right-1/3 w-3 h-3 bg-purple-600 rounded-full"></div>

          {/* Decorative code lines */}
          <div className="absolute left-0 top-1/4 text-gray-800 font-mono text-xs md:text-sm opacity-20 hidden md:block">
            <div>{"const workflow = {"}</div>
            <div className="ml-4">{"nodes: ["}</div>
            <div className="ml-8">{"{ id: 'start', type: 'start' },"}</div>
            <div className="ml-8">{"{ id: 'process', type: 'process' }"}</div>
            <div className="ml-4">{"],"}</div>
            <div className="ml-4">{"edges: [...]"}</div>
            <div>{"}"}</div>
          </div>

          <div className="absolute right-0 bottom-1/4 text-gray-800 font-mono text-xs md:text-sm opacity-20 hidden md:block">
            <div>{"interface FlowNode {"}</div>
            <div className="ml-4">{"id: string"}</div>
            <div className="ml-4">{"type: NodeType"}</div>
            <div className="ml-4">{"position: { x: number, y: number }"}</div>
            <div className="ml-4">{"data: any"}</div>
            <div>{"}"}</div>
          </div>

          {/* Central container */}
          <div className="relative max-w-3xl w-full">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg blur opacity-25"></div>
            <div className="relative bg-black border border-gray-800 rounded-lg p-8 md:p-12 flex flex-col items-center justify-center text-center">
              {/* Conteúdo centralizado */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  Pronto para criar seu workflow?
                </span>
              </h1>

              {/* Botão principal com animações */}
              <div className="relative group">
                {/* Glow effect animado */}
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 rounded-full blur opacity-75 group-hover:opacity-100 animate-pulse transition duration-1000 group-hover:duration-200"></div>

                {/* Botão principal */}
                <Button
                  onClick={() => router.push("/flow")}
                  className="relative px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold rounded-full text-lg shadow-2xl transform transition-all duration-300 hover:scale-105 hover:shadow-purple-500/25 border-0 group-hover:animate-none"
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 animate-spin group-hover:animate-pulse" />
                    <span className="relative">
                      Começar Agora
                      <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-white/50 group-hover:w-full transition-all duration-300"></div>
                    </span>
                    <Play className="h-5 w-5 transform group-hover:translate-x-1 transition-transform duration-300" />
                  </div>

                  {/* Partículas flutuantes */}
                  <div className="absolute inset-0 overflow-hidden rounded-full">
                    <div className="absolute top-2 left-4 w-1 h-1 bg-white/30 rounded-full animate-ping"></div>
                    <div className="absolute bottom-3 right-6 w-1 h-1 bg-white/30 rounded-full animate-ping animation-delay-300"></div>
                    <div className="absolute top-4 right-3 w-1 h-1 bg-white/30 rounded-full animate-ping animation-delay-700"></div>
                  </div>
                </Button>

                {/* Texto de call-to-action */}
                <p className="mt-4 text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300 animate-bounce">
                  👆 Clique aqui para começar sua jornada
                </p>
              </div>
            </div>

            {/* Geometrically irregular floating tech elements */}
            <div className="absolute -top-16 -left-12 transform -rotate-12 bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Layers className="h-3 w-3 mr-1" />
                React
              </div>
            </div>

            <div className="absolute -top-8 left-1/3 transform -translate-x-1/4 rotate-6 bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <Cpu className="h-3 w-3 mr-1" />
                TypeScript
              </div>
            </div>

            <div className="absolute -top-14 right-1/4 transform rotate-[-8deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Database className="h-3 w-3 mr-1" />
                Next.js
              </div>
            </div>

            <div className="absolute -top-6 right-10 transform translate-x-1/4 rotate-[15deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <Cloud className="h-3 w-3 mr-1" />
                Tailwind
              </div>
            </div>

            <div className="absolute top-1/5 -right-16 transform rotate-[-5deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Docker className="h-3 w-3 mr-1" />
                shadcn/ui
              </div>
            </div>

            <div className="absolute top-2/5 right-[-20px] transform translate-x-1/4 rotate-[75deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <MessageSquare className="h-3 w-3 mr-1" />
                Lucide
              </div>
            </div>

            <div className="absolute top-3/4 -right-10 transform translate-x-1/8 rotate-[-65deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Box className="h-3 w-3 mr-1" />
                HTML5
              </div>
            </div>

            <div className="absolute -bottom-12 right-10 transform translate-x-1/8 rotate-[10deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <GitBranch className="h-3 w-3 mr-1" />
                CSS3
              </div>
            </div>

            <div className="absolute -bottom-8 right-1/3 transform translate-x-1/4 rotate-[-7deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <HardDrive className="h-3 w-3 mr-1" />
                LocalStorage
              </div>
            </div>

            <div className="absolute -bottom-16 left-1/3 transform -translate-x-1/4 rotate-[8deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <Workflow className="h-3 w-3 mr-1" />
                Drag&Drop
              </div>
            </div>

            <div className="absolute -bottom-10 left-10 transform -translate-x-1/8 rotate-[-12deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Hexagon className="h-3 w-3 mr-1" />
                JSON
              </div>
            </div>

            <div className="absolute top-3/5 -left-14 transform -translate-x-1/8 rotate-[85deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <Layers className="h-3 w-3 mr-1" />
                SVG
              </div>
            </div>

            <div className="absolute top-1/4 -left-12 transform -translate-x-1/8 rotate-[-10deg] bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="text-purple-400 font-mono text-xs flex items-center">
                <Monitor className="h-3 w-3 mr-1" />
                Hooks
              </div>
            </div>

            <div className="absolute top-2/5 left-[-18px] transform -translate-x-1/8 rotate-[20deg] bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 hidden md:block backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <div className="text-cyan-400 font-mono text-xs flex items-center">
                <Smartphone className="h-3 w-3 mr-1" />
                Responsive
              </div>
            </div>
          </div>

          {/* Mobile version of tech elements - shown only on small screens */}
          <div className="md:hidden mt-8 grid grid-cols-3 gap-2">
            <div className="bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-purple-400 font-mono text-xs flex items-center justify-center">
                <Layers className="h-3 w-3 mr-1" />
                React
              </div>
            </div>
            <div className="bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-cyan-400 font-mono text-xs flex items-center justify-center">
                <Cpu className="h-3 w-3 mr-1" />
                TypeScript
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-purple-400 font-mono text-xs flex items-center justify-center">
                <Database className="h-3 w-3 mr-1" />
                Next.js
              </div>
            </div>
            <div className="bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-cyan-400 font-mono text-xs flex items-center justify-center">
                <Cloud className="h-3 w-3 mr-1" />
                Tailwind
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-900/50 to-purple-700/50 border border-purple-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-purple-400 font-mono text-xs flex items-center justify-center">
                <Docker className="h-3 w-3 mr-1" />
                shadcn/ui
              </div>
            </div>
            <div className="bg-gradient-to-r from-cyan-900/50 to-cyan-700/50 border border-cyan-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="text-cyan-400 font-mono text-xs flex items-center justify-center">
                <Smartphone className="h-3 w-3 mr-1" />
                Responsive
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="container mx-auto p-6 border-t border-gray-800">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div
            className="text-sm cursor-pointer group transition-all duration-300"
            onClick={() => window.open("#", "_blank")}
          >
            <span className="text-gray-500">© {new Date().getFullYear()} </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 font-semibold group-hover:from-purple-300 group-hover:to-cyan-300 transition-all duration-300">
              Lucas Lima
            </span>
            <span className="text-gray-500">. Todos os direitos reservados.</span>
          </div>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <Dialog>
              <DialogTrigger asChild>
                <button className="text-sm text-gray-500 hover:text-white transition-colors interactive-glow">
                  Termos
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] bg-black/95 border border-gray-800/50 backdrop-blur-md text-white max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                    Termos e Condições - Licença MIT
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Leia atentamente os termos de uso deste projeto.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 text-sm text-gray-300 leading-relaxed">
                  <p>
                    Este projeto está sujeito à Licença MIT. Isso se aplica apenas ao código fonte localizado
                    diretamente neste repositório limpo. Durante o processo de desenvolvimento e compilação, código
                    fonte adicional pode ser usado para o qual não obtivemos direitos. Tal código não é coberto pela
                    licença MIT.
                  </p>
                  <p>
                    Para aqueles que não estão familiarizados com a licença, aqui está um resumo de seus pontos
                    principais. Isso não é de forma alguma aconselhamento jurídico nem juridicamente vinculativo.
                  </p>
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <h4 className="font-semibold text-purple-400 mb-2">Você tem permissão para:</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                      <li>
                        <strong>usar</strong>
                      </li>
                      <li>
                        <strong>compartilhar</strong>
                      </li>
                      <li>
                        <strong>modificar</strong>
                      </li>
                    </ul>
                    <p className="mt-2">
                      este projeto inteiramente ou parcialmente, gratuitamente e até comercialmente.
                    </p>
                  </div>
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <h4 className="font-semibold text-cyan-400 mb-2">No entanto, considere o seguinte:</h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-300">
                      <li>
                        Você deve incluir a licença e o aviso de direitos autorais em todas as cópias ou partes
                        substanciais do software.
                      </li>
                      <li>O software é fornecido "como está", sem garantia de qualquer tipo.</li>
                    </ul>
                  </div>
                  <p className="text-center font-medium text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                    Faça o acima e compartilhe seu código fonte com todos; assim como nós fazemos.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            <Link
              href="https://github.com/opZywl/workflow"
              className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 interactive-glow"
            >
              Código Fonte <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
