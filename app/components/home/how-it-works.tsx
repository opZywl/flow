import type { ReactNode } from "react"
import { Check, Download, MousePointer2, ScanEye, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { container, eyebrow } from "./styles"

interface Step {
  title: string
  text: string
  icon: LucideIcon
  detail: ReactNode
}

function Detail({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-[11px]", className)}>{children}</span>
}

export function HowItWorks({ exportDate }: { exportDate: Date }) {
  const steps: Step[] = [
    {
      title: "Monte",
      text: "Arraste componentes da paleta para o canvas, ligue as saídas e preencha cada etapa no painel lateral.",
      icon: MousePointer2,
      detail: <Detail className="border-flow-fg/15 bg-flow-fg/[0.04] text-flow-fg/85">Clique ou arraste para adicionar</Detail>,
    },
    {
      title: "Valide e teste",
      text: "Resolva as pendências apontadas e abra a prévia para percorrer cada caminho da conversa.",
      icon: ScanEye,
      detail: (
        <Detail className="border-flow-success/40 bg-flow-success/10 font-semibold text-flow-success">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Fluxo validado
        </Detail>
      ),
    },
    {
      title: "Exporte",
      text: "Baixe o JSON e importe na plataforma, com a mesma estrutura, os mesmos IDs e o mesmo padrão de conexões.",
      icon: Download,
      detail: (
        <Detail className="border-flow-fg/15 bg-flow-fg/[0.04] font-mono text-flow-fg/85">
          <span className="truncate">Novo atendimento-{exportDate.toISOString().slice(0, 10)}.json</span>
        </Detail>
      ),
    },
  ]

  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className={cn(container, "mt-12 scroll-mt-24 sm:mt-16")}>
      <div className="border-t border-flow-fg/[0.06] pt-12 sm:pt-16">
        <header className="max-w-3xl">
          <p className={eyebrow}>Como funciona</p>
          <h2 id="como-funciona-titulo" className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Três passos.
          </h2>
          <p className="mt-3 text-pretty text-base leading-7 text-flow-muted sm:text-lg">Do primeiro componente ao arquivo que a plataforma importa.</p>
        </header>
        <ol className="mt-10 grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.title} className="flex flex-col rounded-xl border border-flow-fg/[0.08] bg-flow-fg/[0.03]">
                <div className="flex items-center justify-between border-b border-flow-fg/[0.06] px-4 py-2">
                  <span className="font-mono text-[11px] tabular-nums text-flow-muted">
                    {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                  </span>
                  <Icon className="h-4 w-4 text-flow-muted" aria-hidden />
                </div>
                <div className="flex flex-1 flex-col p-5 max-sm:p-4">
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-pretty text-sm leading-6 text-flow-muted">{step.text}</p>
                  <div aria-hidden className="mt-auto pt-5">
                    {step.detail}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
