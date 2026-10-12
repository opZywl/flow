import Link from "next/link"
import { ArrowRight, Github } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { REPOSITORY_URL, focusRing } from "./styles"

const item = `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium text-flow-muted-strong transition-colors duration-200 hover:bg-flow-fg/10 hover:text-flow-fg ${focusRing}`

const iconItem = `inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-flow-muted-strong transition-colors duration-200 hover:bg-flow-fg/10 hover:text-flow-fg ${focusRing}`

export function SiteNav() {
  return (
    <header className="pointer-events-none sticky top-0 z-50 px-4 pt-3 sm:px-6">
      <nav
        aria-label="Principal"
        className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-1 rounded-2xl border border-flow-fg/[0.35] bg-flow-bg/85 p-1 shadow-sm backdrop-blur-2xl backdrop-saturate-200 [.home-theme-light_&]:border-flow-border"
      >
        <Link href="/" className={cn(item, "gap-2.5 pl-2 pr-3 text-flow-fg")}>
          <img src="/icon.svg" alt="" width={28} height={28} className="size-7 rounded-lg" />
          <span className="font-semibold">WorkFlow</span>
        </Link>
        <a href="#recursos" className={cn(item, "max-sm:hidden")}>
          Recursos
        </a>
        <a href="#como-funciona" className={cn(item, "max-sm:hidden")}>
          Como funciona
        </a>
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-flow-fg/20 max-sm:hidden" />
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="Código-fonte no GitHub (abre em nova aba)" title="GitHub" className={cn(iconItem, "max-md:hidden")}>
          <Github className="size-5" aria-hidden />
        </a>
        <ThemeToggle className={iconItem} />
        <Link
          href="/flow"
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-flow-fg px-4 text-sm font-semibold text-flow-bg shadow-sm transition duration-200 ease-out hover:bg-flow-fg/90 active:scale-95 motion-reduce:transition-none ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-flow-bg`}
        >
          Abrir editor
          <ArrowRight className="size-4 max-sm:hidden" aria-hidden />
        </Link>
      </nav>
    </header>
  )
}
