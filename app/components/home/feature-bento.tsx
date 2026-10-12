import { Fragment, type CSSProperties, type ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import { categories, componentCatalog } from "@/lib/atendimento/catalog"
import { cn } from "@/lib/utils"
import { EditorPreview } from "./editor-preview"
import { bentoPanel, bentoShell, container, glassTag, glassTagInner } from "./styles"
import styles from "./home.module.css"

const CATEGORY_COUNTS = categories.map((category) => ({
  ...category,
  count: componentCatalog.filter((entry) => entry.category === category.id).length,
}))

const SHORTCUTS: ReadonlyArray<readonly [readonly string[], string]> = [
  [["Ctrl", "Z"], "Desfazer"],
  [["Ctrl", "Y"], "Refazer"],
  [["Ctrl", "S"], "Salvar"],
  [["Ctrl", "K"], "Buscar no fluxo"],
  [["Delete"], "Remover seleção"],
  [[".json"], "Soltar para importar"],
]

const PROVIDERS = ["ChatGPT", "Claude", "Gemini"]

const ISSUES = [
  { message: "Conecte a saída “Financeiro”.", component: "Menu de Opções" },
  { message: "Informe a URL da imagem.", component: "Enviar Imagem" },
]

const stagger = (index: number) => ({ "--flow-stagger": index }) as CSSProperties

function BentoCard({
  index,
  as: Tag = "article",
  className,
  panelClassName,
  children,
}: {
  index: number
  as?: "article" | "div"
  className?: string
  panelClassName?: string
  children: ReactNode
}) {
  return (
    <Tag className={cn(bentoShell, styles.fadeUp, className)} style={stagger(index)}>
      <div className={cn(bentoPanel, panelClassName)}>{children}</div>
    </Tag>
  )
}

function CardText({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-auto pt-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-pretty text-sm leading-6 text-flow-muted">{children}</p>
    </div>
  )
}

function ComponentsCard({ index }: { index: number }) {
  return (
    <BentoCard index={index} className="lg:col-span-2 lg:row-span-2">
      <h3>
        <span className="block text-5xl font-extrabold leading-none tracking-tight max-sm:text-4xl">{componentCatalog.length}</span>{" "}
        <span className="mt-3 block text-xl font-semibold">componentes</span>
      </h3>
      <p className="mt-2 text-pretty text-sm leading-6 text-flow-muted">Os mesmos da plataforma, com os campos, os valores padrão e as saídas de cada um.</p>
      <ul aria-label="Componentes por categoria" className="mt-5 flex flex-wrap gap-2">
        {CATEGORY_COUNTS.map((category) => (
          <li key={category.id} className={glassTag}>
            <span className={cn(glassTagInner, "px-2.5 py-1 text-[13px]")}>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              {category.label}
              <span className="font-mono text-[11px] tabular-nums text-flow-fg/60">{category.count}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-5 font-mono text-[11px] leading-5 text-flow-muted">{componentCatalog.length - 1} na biblioteca, mais o Iniciar Fluxo.</p>
    </BentoCard>
  )
}

function JsonLine({ indent = 1, name, value, last, highlight }: { indent?: number; name?: string; value: string; last?: boolean; highlight?: boolean }) {
  return (
    <span className={cn("block whitespace-pre", highlight && "-mx-3 border-l-2 border-flow-accent bg-flow-accent/10 pl-2.5 pr-3")}>
      {"  ".repeat(indent)}
      {name !== undefined && (
        <>
          <span className="text-flow-fg/85">&quot;{name}&quot;</span>
          <span className="text-flow-fg/60">: </span>
        </>
      )}
      <span className="text-flow-fg/60">{value}</span>
      {!last && <span className="text-flow-fg/60">,</span>}
    </span>
  )
}

function FormatCard({ index, exportDate }: { index: number; exportDate: Date }) {
  const createdAt = exportDate.toISOString()

  return (
    <BentoCard index={index} className="lg:col-span-4" panelClassName="gap-5 lg:grid lg:grid-cols-5 lg:items-start">
      <div className="flex flex-col lg:col-span-2">
        <span aria-hidden className="inline-flex items-center text-4xl font-bold leading-none">
          {"{"}
          <span className="w-2 transition-[width] duration-200 ease-out group-hover:w-5 motion-reduce:transition-none" />
          {"}"}
        </span>
        <h3 className="mt-4 text-xl font-semibold">Formato da plataforma</h3>
        <p className="mt-2 text-pretty text-sm leading-6 text-flow-muted">
          Importe um JSON exportado pela plataforma e exporte de novo: o arquivo volta igual, byte a byte. Só a data de exportação muda.
        </p>
      </div>
      <div aria-hidden className="overflow-hidden rounded-xl border border-flow-fg/[0.08] bg-flow-fg/[0.03] font-mono lg:col-span-3">
        <div className="flex items-center gap-2 border-b border-flow-fg/[0.06] px-3 py-2">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-flow-fg/15" />
            <span className="size-2 rounded-full bg-flow-fg/15" />
            <span className="size-2 rounded-full bg-flow-fg/15" />
          </span>
          <span className="truncate text-[11px] text-flow-fg/60">Novo atendimento-{createdAt.slice(0, 10)}.json</span>
        </div>
        <pre className="overflow-hidden px-3 py-2.5 text-[11px] leading-5 [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]">
          <JsonLine indent={0} value="{" last />
          <JsonLine name="name" value={'"Novo atendimento"'} />
          <JsonLine name="description" value={'""'} />
          <JsonLine name="service_type" value={'"chat"'} />
          <JsonLine name="created_at" value={`"${createdAt}"`} highlight />
          <JsonLine name="nodes" value="[" last />
          <JsonLine indent={2} value="{" last />
          <JsonLine indent={3} name="id" value={'"inicio"'} />
        </pre>
      </div>
    </BentoCard>
  )
}

function ValidationCard({ index }: { index: number }) {
  return (
    <BentoCard index={index} className="lg:col-span-2">
      <div aria-hidden>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-flow-warning/40 bg-flow-warning/10 px-2.5 text-xs font-semibold text-flow-warning">
          <TriangleAlert className="h-3.5 w-3.5" />2 pendências
        </span>
        <ul className="mt-2 divide-y divide-flow-fg/[0.06] rounded-lg border border-flow-fg/[0.08]">
          {ISSUES.map((issue) => (
            <li key={issue.component} className="flex gap-2 px-3 py-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-warning" />
              <span className="min-w-0">
                <span className="block text-xs text-flow-fg">{issue.message}</span>
                <span className="block text-[11px] text-flow-muted">{issue.component}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <CardText title="Validação ao vivo">Cada pendência leva ao componente que precisa de atenção. Só erro de fato bloqueia a exportação.</CardText>
    </BentoCard>
  )
}

function ConversationCard({ index }: { index: number }) {
  return (
    <BentoCard index={index} className="lg:col-span-2">
      <div aria-hidden className="flex flex-col gap-1.5 text-xs leading-5">
        <p className="self-start rounded-xl rounded-bl-sm bg-flow-fg/[0.06] px-3 py-2 text-flow-fg/85">
          Olá. Como podemos ajudar?
          <span className="mt-1 block text-flow-fg/60">1. Suporte · 2. Financeiro</span>
          <span className="block text-flow-fg/60">3. Falar com atendente</span>
        </p>
        <p className="self-end rounded-xl rounded-br-sm bg-flow-fg px-3 py-2 font-medium text-flow-bg">2</p>
        <p className="mr-8 self-start rounded-xl rounded-bl-sm bg-flow-fg/[0.06] px-3 py-2 text-flow-fg/85">Transferido para o departamento “Financeiro”. A prévia termina aqui.</p>
      </div>
      <CardText title="Prévia do atendimento">Converse com o fluxo e escolha o resultado de cada integração, sem chamar a plataforma.</CardText>
    </BentoCard>
  )
}

function AiCard({ index }: { index: number }) {
  return (
    <BentoCard index={index} className="lg:col-span-3">
      <div aria-hidden>
        <p className="rounded-lg border border-flow-fg/15 bg-flow-fg/[0.04] px-3 py-2.5 text-xs leading-5 text-flow-fg/85">
          Clínica odontológica: identificar o paciente, oferecer horários livres e confirmar a consulta.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {PROVIDERS.map((provider) => (
            <span key={provider} className={glassTag}>
              <span className={glassTagInner}>{provider}</span>
            </span>
          ))}
        </div>
      </div>
      <CardText title="Geração com IA">Descreva o atendimento e revise o fluxo gerado pelo ChatGPT, Claude ou Gemini. A sua chave vai só na requisição.</CardText>
    </BentoCard>
  )
}

function ShortcutsCard({ index }: { index: number }) {
  return (
    <BentoCard index={index} className="lg:col-span-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="flex items-center gap-2">
            <dt className="flex shrink-0 gap-1">
              {keys.map((key, position) => (
                <Fragment key={key}>
                  {position > 0 && <span className="sr-only">+</span>}
                  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-flow-fg/15 bg-flow-fg/[0.04] px-1.5 font-mono text-[11px] text-flow-fg/85">{key}</kbd>
                </Fragment>
              ))}
            </dt>
            <dd className="truncate text-xs text-flow-muted">{label}</dd>
          </div>
        ))}
      </dl>
      <CardText title="Produtividade">Desfazer e refazer, atalhos de teclado e tema claro ou escuro, com a cor de destaque que você escolher.</CardText>
    </BentoCard>
  )
}

export function FeatureBento({ exportDate }: { exportDate: Date }) {
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className={cn(container, "scroll-mt-24")}>
      <h2 id="recursos-titulo" className="sr-only">
        Recursos
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <BentoCard index={4} as="div" className="sm:col-span-2 lg:col-span-6" panelClassName="p-0 max-sm:p-0">
          <EditorPreview />
        </BentoCard>
        <ComponentsCard index={5} />
        <FormatCard index={6} exportDate={exportDate} />
        <ValidationCard index={7} />
        <ConversationCard index={8} />
        <AiCard index={8} />
        <ShortcutsCard index={8} />
      </div>
    </section>
  )
}
