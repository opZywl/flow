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
} from "lucide-react"
import { MouseTrailEffect } from "./components/mouse-trail-effect"
import { PopupPortfolio } from "./components/popup-portfolio"
import { Button } from "@/components/ui/button"

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
            <div>{"namespace Lucas.Web.Controllers {"}</div>
            <div className="ml-4">{"public class HomeController : Controller {"}</div>
            <div className="ml-8">{"public IActionResult Index() {"}</div>
            <div className="ml-12">{"return View();"}</div>
            <div className="ml-8">{"}"}</div>
            <div className="ml-4">{"}"}</div>
            <div>{"}"}</div>
          </div>

          <div className="absolute right-0 bottom-1/4 text-gray-800 font-mono text-xs md:text-sm opacity-20 hidden md:block">
            <div>{"@model Lucas.Web.Models.ProfileModel"}</div>
            <div>{"@{"}</div>
            <div className="ml-4">{'ViewData["Title"] = "ASP.NET Developer";'}</div>
            <div>{"}"}</div>
            <div>{'<div class="profile">'}</div>
            <div className="ml-4">{"<h1>@Model.Name</h1>"}</div>
            <div>{"</div>"}</div>
          </div>

          {/* Central container */}
          <div className="relative max-w-3xl w-full">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg blur opacity-25"></div>
            <div className="relative bg-black border border-gray-800 rounded-lg p-8 md:p-12 flex flex-col items-center justify-center text-center">
              {/* Conteúdo centralizado */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-4">
                Hi, I'm{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  Lucas Lima!
                </span>
              </h1>
              <Button
                variant="ghost"
                className="inline-block px-3 py-1 text-xs font-medium bg-purple-900/30 text-purple-400 rounded-full hover:bg-purple-900/50 transition-colors"
                onClick={() => router.push("/flow")}
              >
                Frontend Developer
              </Button>
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
            <span className="text-gray-500">. All rights reserved.</span>
          </div>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <Link href="#" className="text-sm text-gray-500 hover:text-white transition-colors interactive-glow">
              Privacy
            </Link>
            <Link href="#" className="text-sm text-gray-500 hover:text-white transition-colors interactive-glow">
              Terms
            </Link>
            <Link
              href="https://react.dev"
              className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 interactive-glow"
            >
              React <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
