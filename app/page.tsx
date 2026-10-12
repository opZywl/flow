import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { Space_Grotesk } from "next/font/google"
import { ArrowRight, Github } from "lucide-react"
import { componentCatalog } from "@/lib/atendimento/catalog"
import { cn } from "@/lib/utils"
import { FeatureBento } from "./components/home/feature-bento"
import { HowItWorks } from "./components/home/how-it-works"
import { SiteFooter } from "./components/home/site-footer"
import { SiteNav } from "./components/home/site-nav"
import { REPOSITORY_URL, container, eyebrow, primaryButton, secondaryButton, strongEyebrow } from "./components/home/styles"
import styles from "./components/home/home.module.css"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "WorkFlow",
}

const GRID_SQUARES: ReadonlyArray<readonly [number, number]> = [
  [4, 3],
  [9, 1],
  [13, 5],
  [19, 2],
  [24, 6],
  [28, 3],
  [33, 1],
  [7, 8],
  [16, 9],
  [22, 11],
  [30, 8],
  [11, 12],
]

const stagger = (index: number) => ({ "--flow-stagger": index }) as CSSProperties

function BackgroundGrid() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[60rem] w-full skew-y-12 fill-flow-fg/[0.03] stroke-flow-fg/[0.07] [mask-image:radial-gradient(800px_circle_at_center,white,transparent)] [.home-theme-light_&]:hidden"
    >
      <defs>
        <pattern id="home-grid" width={40} height={40} patternUnits="userSpaceOnUse" x={-1} y={-1}>
          <path d="M.5 40V.5H40" fill="none" strokeDasharray="4 2" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill="url(#home-grid)" />
      {GRID_SQUARES.map(([column, row]) => (
        <rect key={`${column}-${row}`} strokeWidth={0} width={39} height={39} x={column * 40} y={row * 40} />
      ))}
    </svg>
  )
}

export default function Home() {
  const today = new Date()

  return (
    <div className={cn(spaceGrotesk.className, styles.root, "relative isolate min-h-dvh overflow-x-clip bg-flow-bg text-flow-fg antialiased")}>
      <BackgroundGrid />
      <SiteNav />
      <main>
        <section aria-labelledby="inicio-titulo" className={cn(container, "pb-10 pt-14 sm:pt-16")}>
          <p className={cn(eyebrow, styles.fadeUp)} style={stagger(0)}>
            Compatível com o JSON de Atendimento
          </p>
          <h1 id="inicio-titulo" className={cn("mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl", styles.fadeUp)} style={stagger(1)}>
            Fluxos de atendimento.
          </h1>
          <p className={cn("mt-5 max-w-2xl text-pretty text-base leading-7 text-flow-muted sm:text-lg", styles.fadeUp)} style={stagger(2)}>
            Monte, valide e exporte o fluxo no formato que a plataforma importa sem ajuste, com os mesmos {componentCatalog.length} componentes.
          </p>
          <div className={cn("mt-8 flex flex-wrap gap-3", styles.fadeUp)} style={stagger(3)}>
            <Link href="/flow" className={primaryButton}>
              Abrir editor
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
              <Github className="size-4" aria-hidden />
              Ver no GitHub
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </div>
        </section>
        <FeatureBento exportDate={today} />
        <HowItWorks exportDate={today} />
        <section aria-labelledby="final-titulo" className={cn(container, "mt-12 sm:mt-16")}>
          <div className="flex flex-col gap-6 rounded-2xl border border-flow-fg/[0.08] bg-flow-fg/[0.03] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className={strongEyebrow}>Próximo passo</p>
              <h2 id="final-titulo" className="mt-2 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                Comece do zero ou importe um JSON da plataforma.
              </h2>
            </div>
            <Link href="/flow" className={cn(primaryButton, "shrink-0 self-start sm:self-auto")}>
              Abrir editor
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter year={today.getFullYear()} />
    </div>
  )
}
