import { cn } from "@/lib/utils"
import { AUTHOR_URL, REPOSITORY_URL, container, focusRing } from "./styles"

const LINKS = [
  { label: "Portfólio", href: "https://lucas-lima.xyz" },
  { label: "Discord", href: "https://discord.com/invite/3XRFGeqEYD" },
  { label: "Código-fonte", href: REPOSITORY_URL },
  { label: "Licença GPL-3.0", href: "https://www.gnu.org/licenses/gpl-3.0.html" },
]

const link = `rounded-md transition-colors duration-200 hover:text-flow-fg ${focusRing}`

export function SiteFooter({ year }: { year: number }) {
  return (
    <footer className={cn(container, "mt-12 sm:mt-16")}>
      <div className="flex flex-col gap-2 border-t border-flow-fg/[0.06] py-6 sm:flex-row sm:items-center sm:justify-between sm:py-8">
        <p className="flex items-center gap-2.5 text-xs text-flow-muted">
          <img src="/icon.svg" alt="" width={20} height={20} className="size-5 rounded-md" />
          <span>
            © {year}{" "}
            <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className={cn(link, "-mx-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-medium text-flow-fg/85")}>
              Zywl
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </span>
        </p>
        <ul className="-mx-2 flex flex-wrap items-center">
          {LINKS.map((item) => (
            <li key={item.label}>
              <a href={item.href} target="_blank" rel="noreferrer" className={cn(link, "inline-flex min-h-11 items-center px-2 text-xs uppercase tracking-[0.2em] text-flow-muted")}>
                {item.label}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
