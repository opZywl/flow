"use client"

import Link from "next/link"
import {
  Box,
  Cloud,
  Cpu,
  Database,
  DockIcon,
  ExternalLink,
  GitBranch,
  HardDrive,
  Hexagon,
  Layers,
  type LucideIcon,
  MessageSquare,
  Monitor,
  Play,
  Smartphone,
  Sparkles,
  Workflow,
} from "lucide-react"
import { MouseTrailEffect } from "./components/mouse-trail-effect"
import { PopupPortfolio } from "./components/popup-portfolio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const SOURCE_URL = "https://github.com/opZywl/flow"
const LICENSE_URL = "https://www.gnu.org/licenses/gpl-3.0.html"

type Tone = "purple" | "cyan"

interface TechTag {
  label: string
  icon: LucideIcon
  tone: Tone
  position: string
  mobile?: boolean
}

const TONES: Record<Tone, { surface: string; glow: string; text: string }> = {
  purple: {
    surface: "border-purple-500/30 from-purple-900/50 to-purple-700/50",
    glow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]",
    text: "text-purple-400",
  },
  cyan: {
    surface: "border-cyan-500/30 from-cyan-900/50 to-cyan-700/50",
    glow: "shadow-[0_0_15px_rgba(6,182,212,0.3)]",
    text: "text-cyan-400",
  },
}

const TECH_TAGS: TechTag[] = [
  { label: "React", icon: Layers, tone: "purple", position: "-top-16 -left-12 -rotate-12", mobile: true },
  { label: "TypeScript", icon: Cpu, tone: "cyan", position: "-top-8 left-1/3 -translate-x-1/4 rotate-6", mobile: true },
  { label: "Next.js", icon: Database, tone: "purple", position: "-top-14 right-1/4 rotate-[-8deg]", mobile: true },
  { label: "Tailwind", icon: Cloud, tone: "cyan", position: "-top-6 right-10 translate-x-1/4 rotate-[15deg]", mobile: true },
  { label: "shadcn/ui", icon: DockIcon, tone: "purple", position: "top-[20%] -right-16 rotate-[-5deg]", mobile: true },
  { label: "Lucide", icon: MessageSquare, tone: "cyan", position: "top-[40%] right-[-20px] translate-x-1/4 rotate-[75deg]" },
  { label: "HTML5", icon: Box, tone: "purple", position: "top-3/4 -right-10 translate-x-[12.5%] rotate-[-65deg]" },
  { label: "CSS3", icon: GitBranch, tone: "cyan", position: "-bottom-12 right-10 translate-x-[12.5%] rotate-[10deg]" },
  { label: "LocalStorage", icon: HardDrive, tone: "purple", position: "-bottom-8 right-1/3 translate-x-1/4 rotate-[-7deg]" },
  { label: "Arrastar e soltar", icon: Workflow, tone: "cyan", position: "-bottom-16 left-1/3 -translate-x-1/4 rotate-[8deg]" },
  { label: "JSON", icon: Hexagon, tone: "purple", position: "-bottom-10 left-10 -translate-x-[12.5%] rotate-[-12deg]" },
  { label: "SVG", icon: Layers, tone: "cyan", position: "top-[60%] -left-14 -translate-x-[12.5%] rotate-[85deg]" },
  { label: "Hooks", icon: Monitor, tone: "purple", position: "top-1/4 -left-12 -translate-x-[12.5%] rotate-[-10deg]" },
  { label: "Responsivo", icon: Smartphone, tone: "cyan", position: "top-[40%] left-[-18px] -translate-x-[12.5%] rotate-[20deg]", mobile: true },
]

const INDENTS = ["", "ml-4", "ml-8"] as const

const CODE_FLOW: [string, number][] = [
  ["const fluxo = {", 0],
  ["nodes: [", 1],
  ['{ id: "inicio", type: "custom" },', 2],
  ['{ id: "2", type: "custom" }', 2],
  ["],", 1],
  ["edges: [...]", 1],
  ["}", 0],
]

const CODE_NODE: [string, number][] = [
  ["interface AtendimentoNode {", 0],
  ["id: string", 1],
  ['type: "custom"', 1],
  ["position: { x: number, y: number }", 1],
  ["data: AtendimentoData", 1],
  ["}", 0],
]

function CodeLines({ lines, className }: { lines: [string, number][]; className: string }) {
  return (
    <div className={cn("absolute hidden font-mono text-xs text-gray-800 opacity-20 md:block md:text-sm", className)} aria-hidden="true">
      {lines.map(([text, indent], index) => (
        <div key={index} className={INDENTS[indent]}>
          {text}
        </div>
      ))}
    </div>
  )
}

function TagContent({ tag, centered }: { tag: TechTag; centered?: boolean }) {
  const Icon = tag.icon
  return (
    <span className={cn("flex items-center whitespace-nowrap font-mono text-xs", TONES[tag.tone].text, centered && "justify-center")}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {tag.label}
    </span>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <MouseTrailEffect />
      <PopupPortfolio />
      <main className="flex-1">
        <section className="container relative mx-auto flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24 md:py-32">
          <div className="absolute left-10 top-20 h-24 w-24 rounded-full bg-purple-900/10 blur-xl" aria-hidden="true" />
          <div className="absolute bottom-20 right-10 h-32 w-32 rounded-full bg-cyan-900/10 blur-xl" aria-hidden="true" />
          <div className="absolute right-1/4 top-1/3 h-2 w-2 rounded-full bg-purple-400" aria-hidden="true" />
          <div className="absolute left-1/3 top-2/3 h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
          <div className="absolute bottom-1/4 right-1/3 h-3 w-3 rounded-full bg-purple-600" aria-hidden="true" />

          <CodeLines lines={CODE_FLOW} className="left-0 top-1/4" />
          <CodeLines lines={CODE_NODE} className="bottom-1/4 right-0" />

          <div className="relative w-full max-w-3xl">
            <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 opacity-25 blur" aria-hidden="true" />
            <div className="relative flex flex-col items-center justify-center rounded-lg border border-gray-800 bg-black p-8 text-center md:p-12">
              <h1 className="mb-8 text-4xl font-bold tracking-tighter md:text-5xl lg:text-6xl">
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Pronto para criar seu fluxo de atendimento?
                </span>
              </h1>

              <div className="group relative flex flex-col items-center">
                <div
                  className="absolute -inset-1 animate-pulse rounded-full bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 opacity-75 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200"
                  aria-hidden="true"
                />
                <Button
                  asChild
                  className="relative rounded-full border-0 bg-gradient-to-r from-purple-600 to-cyan-600 px-8 py-4 text-lg font-bold text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:from-purple-500 hover:to-cyan-500 hover:shadow-purple-500/25 group-hover:animate-none"
                >
                  <Link href="/flow">
                    <span className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 animate-spin group-hover:animate-pulse" aria-hidden="true" />
                      <span className="relative">
                        Começar agora
                        <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-white/50 transition-all duration-300 group-hover:w-full" />
                      </span>
                      <Play className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                    <span className="absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
                      <span className="absolute left-4 top-2 h-1 w-1 animate-ping rounded-full bg-white/30" />
                      <span className="animation-delay-300 absolute bottom-3 right-6 h-1 w-1 animate-ping rounded-full bg-white/30" />
                      <span className="animation-delay-700 absolute right-3 top-4 h-1 w-1 animate-ping rounded-full bg-white/30" />
                    </span>
                  </Link>
                </Button>
              </div>
            </div>

            {TECH_TAGS.map((tag) => (
              <div
                key={tag.label}
                className={cn(
                  "absolute hidden rounded-lg border bg-gradient-to-r p-2 backdrop-blur-sm md:block",
                  TONES[tag.tone].surface,
                  TONES[tag.tone].glow,
                  tag.position,
                )}
                aria-hidden="true"
              >
                <TagContent tag={tag} />
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-2 md:hidden" aria-hidden="true">
            {TECH_TAGS.filter((tag) => tag.mobile).map((tag) => (
              <div key={tag.label} className={cn("rounded-lg border bg-gradient-to-r p-2 backdrop-blur-sm", TONES[tag.tone].surface)}>
                <TagContent tag={tag} centered />
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="container mx-auto border-t border-gray-800 p-6">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <p className="text-sm">
            <span className="text-gray-500 transition-colors duration-300 hover:text-gray-300">© {new Date().getFullYear()} </span>
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text font-semibold text-transparent transition-all duration-300 hover:from-purple-300 hover:to-cyan-300">
              Lucas Lima
            </span>
            <span className="text-gray-500 transition-colors duration-300 hover:text-gray-300">. Todos os direitos reservados.</span>
          </p>
          <div className="mt-4 flex space-x-4 md:mt-0">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-sm text-gray-500 transition-all duration-300 hover:text-white hover:shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                >
                  Termos
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] overflow-y-auto border border-gray-800/50 bg-black/95 text-white backdrop-blur-md sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-xl font-bold text-transparent">
                    Termos de uso
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">Resumo da licença GPL-3.0 que rege este projeto.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 text-sm leading-relaxed text-gray-300">
                  <p>
                    Este projeto é distribuído sob a Licença Pública Geral GNU, versão 3 (GPL-3.0). A licença cobre o
                    código-fonte deste repositório; bibliotecas de terceiros seguem as próprias licenças.
                  </p>
                  <p>Este resumo não substitui o texto da licença e não é aconselhamento jurídico.</p>
                  <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                    <h4 className="mb-2 font-semibold text-purple-400">Você pode:</h4>
                    <ul className="list-inside list-disc space-y-1">
                      <li>usar o software, inclusive para fins comerciais;</li>
                      <li>estudar e modificar o código;</li>
                      <li>distribuir cópias, originais ou modificadas.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                    <h4 className="mb-2 font-semibold text-cyan-400">Desde que:</h4>
                    <ul className="list-inside list-disc space-y-2">
                      <li>mantenha a licença e os avisos de direitos autorais;</li>
                      <li>disponibilize o código-fonte ao distribuir o software;</li>
                      <li>distribua as versões modificadas sob a mesma licença, indicando as alterações.</li>
                    </ul>
                  </div>
                  <p>O software é fornecido &quot;como está&quot;, sem garantia de qualquer tipo.</p>
                  <a
                    href={LICENSE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1 font-medium text-cyan-400 transition-colors hover:text-cyan-300"
                  >
                    Ler o texto completo da GPL-3.0 <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </DialogContent>
            </Dialog>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-gray-500 transition-all duration-300 hover:text-white hover:shadow-[0_0_8px_rgba(6,182,212,0.6)]"
            >
              Código-fonte <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
