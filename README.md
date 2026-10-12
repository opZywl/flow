<div align="center">

<img src="app/icon.svg" alt="WorkFlow" width="120" />

# WorkFlow

### A visual editor for customer service flows that exports straight into the platform's JSON.

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-0F172A?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8)](https://tailwindcss.com/)
[![Website](https://img.shields.io/badge/Website-flow--yzy.vercel.app-3B82F6?style=for-the-badge&logo=vercel&logoColor=white)](https://flow-yzy.vercel.app/flow)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/invite/3XRFGeqEYD)

[![CI](https://github.com/opZywl/flow/actions/workflows/ci.yml/badge.svg)](https://github.com/opZywl/flow/actions/workflows/ci.yml)
[![CodeQL](https://github.com/opZywl/flow/actions/workflows/codeql.yml/badge.svg)](https://github.com/opZywl/flow/actions/workflows/codeql.yml)

[opZywl](https://github.com/opZywl) · [flow-yzy.vercel.app](https://flow-yzy.vercel.app/flow) · [lucas-lima.xyz](https://lucas-lima.xyz) · [LinkedIn](https://www.linkedin.com/in/lucsp-lima/)

**English** · [Português](README.pt-BR.md)

</div>

## What it does

You draw the conversation: drag components onto the canvas, wire their
outputs and fill in each step in a side panel. The editor checks the flow while
you work and exports a JSON file that the Atendimento platform imports as is.

It is a true round trip. Import a file exported by the platform, export it
again and you get the same file back, byte for byte, with only the export date
refreshed. Everything you create follows the same structure, the same IDs and
the same connection pattern.

The interface is in Brazilian Portuguese, like the platform it targets.

## Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/editor-dark.png" alt="Editor with a sample flow in the dark theme"></td>
    <td><img src="docs/screenshots/panel-dark.png" alt="Configuration panel of an options menu"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/preview-dark.png" alt="Conversation preview running the sample flow"></td>
    <td><img src="docs/screenshots/editor-light.png" alt="Editor in the light theme"></td>
  </tr>
</table>

## The editor

| On screen | What it does |
|---|---|
| library | the 61 palette components by category, with search; click or drag to add |
| canvas | rule-checked connections (one input per component, one target per output), multi-select, undo and redo, minimap |
| components | a summary of each step, labeled outputs and a remove button on hover |
| panel | the fields of each component in the platform's order, with editors for menu options, business hours, weighted paths, conditions and lists, plus technical fields and the full JSON |
| validation | live issues, also shown under the field they refer to; each one jumps to the component that needs attention |
| preview | a simulated conversation covering all 62 components, where you pick the result of each integration, without calling the platform |
| import | Atendimento JSON, older flows from this editor and AI generation |
| theme | light or dark, with the accent color you pick in Cores |

`Ctrl+Z` undoes, `Ctrl+Y` redoes, `Ctrl+S` saves, `Ctrl+K` searches the flow
and `Delete` removes the selection. Dropping a `.json` file on the canvas
imports it.

## Atendimento JSON compatibility

The format comes from files exported by the platform itself, and those files
are the only source the editor follows:

- envelope with `name`, `description`, `service_type`, `created_at`, `nodes`, `edges` and `viewport`
- components with `data.type`, `data.data` and `data.html`, written as `type: "custom"` except the note (`"note"`) and the API options menu (`"apiOptionsMenu"`), exactly as the platform writes them; the start is always `inicio` and every other component gets a sequential numeric ID
- `deletable` connections with `sourceHandle: "output-N"` and the id `xy-edge__<source><handle>-<target>`
- `created_at` stamped at export time, with the same serialization the platform uses

All 62 platform components have a real example in those exports, and the
editor creates each one with exactly the same fields, key order, defaults,
html and size: 4 messages, 4 templates, 5 routing and transfer, 7 scheduling,
3 tickets, 7 CRM, 1 live chat, 5 flow control, 5 conditions, 2 AI, 14 APIs and
5 data collection components. The library shows 61 of them; the 62nd is the
start, which every flow already has.

Most components have a single output (Próximo) or none, when they end that
path. The ones with more than one output are listed below; the platform's
oldest components put the negative path on `output-0`, the newer ones put the
positive path there.

<details>
<summary>Components with more than one output</summary>

| Component | Outputs, in order |
|---|---|
| Menu de Opções | one per option, following `text-1`, `text-2`… (up to 10) |
| Múltipla Condição | one per condition, following `var-1`, `var-2`… (up to 20) |
| Randomizador (teste A/B) | one per weighted path, at least 2 |
| Agente de IA | one per agent exit, then Sem conclusão |
| Idioma | Português, Inglês, Espanhol, Outro idioma |
| Condições de Tempo | Fora do horário, Dentro do horário |
| Solicitar Dados, Consulta API, API de Mensagem, DataStore Local, Enviar Boletos | Falha, Sucesso |
| Condicional | Falso, Verdadeiro |
| Enviar Formulário | Respondido, Não respondido |
| Transferir para Ligação, Continuar no Chat | Sucesso, Falha |
| Escolher Serviço | Serviço escolhido, Nenhum disponível |
| Escolher Local | Local escolhido, Nenhum disponível |
| Escolher Profissional | Profissional escolhido, Nenhum disponível |
| Escolher Horário | Horário escolhido, Nenhum disponível |
| Identificar Cliente (scheduling and CRM) | Identificado, Não identificado |
| Dados do Cliente | Dados registrados, Dados não registrados |
| Confirmar Agendamento | Agendado, Não agendado |
| Consultar Chamados | Chamado escolhido, Nenhum chamado |
| Abrir Chamado | Chamado aberto, Não aberto |
| Detalhe do Chamado | Encontrado, Não encontrado |
| Criar/Atualizar Contato, Capturar Lead, Qualificar Lead, Agendar Follow-up, Inscrever em Lista | Sucesso, Falha |
| Google Planilhas, Registrar no RD Station, Criar/Atualizar no HubSpot, Menu de Opções API | Sucesso, Falha |
| Entrada de Dados | Válido, Inválido |
| Veio do anúncio? | Sim, Não |
| Consentimento | Aceitou, Recusou |

</details>

Validation only blocks the export on real errors, such as broken structure,
unconnected outputs or invalid values. A component that is not configured yet
is a warning, so a platform export with half-finished steps still goes back
and forth untouched. The full list of components, output meanings and rules is
in [docs/atendimento-compatibilidade.md](docs/atendimento-compatibilidade.md).

## Run it yourself

WorkFlow is a Next.js app. It needs Node 20.9 or newer and pnpm 10.

```sh
git clone https://github.com/opZywl/flow
cd flow
pnpm install
pnpm dev     # editor at http://localhost:3000/flow
pnpm build   # production build
pnpm start   # serve the build on port 3000
```

AI generation runs on your own API key, typed into the dialog. The key is sent
only with the request and is not stored by the server.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | development server on port 3000 |
| `pnpm build` and `pnpm start` | production build and server |
| `pnpm typecheck` | type checking |
| `pnpm lint` | ESLint |
| `pnpm test` | format and preview unit tests |
| `pnpm check:reference -- "<file>"` | checks the round trip of a JSON exported by the platform |
| `pnpm test:e2e` | production build plus Playwright browser tests |

Point `FLOW_REFERENCE` at one or more JSON files exported by the platform and
the unit and browser tests also validate them. Separate the files with the
system path delimiter, `:` on Linux and macOS and `;` on Windows:

```sh
FLOW_REFERENCE="path/to/export-1.json:path/to/export-2.json" pnpm test
FLOW_REFERENCE="path/to/export-1.json:path/to/export-2.json" pnpm test:e2e
```

```powershell
$env:FLOW_REFERENCE = "path\to\export-1.json;path\to\export-2.json"
pnpm test
pnpm test:e2e
```

Each file becomes its own test: a byte for byte round trip with no blocking
issue, every component type known, a preview that answers every reachable
choice and the same round trip through the browser. Without the variable these
tests are skipped with a notice, and so is a file that does not exist. Keep
real exports out of the repository: they carry internal data.

## What's inside

```text
app/                Next.js routes and the AI generation API
src/flow/           the editor: canvas, components, library, panel and preview
lib/atendimento/    the format: import, validation, export and simulation
components/ui/      interface primitives
tests/              unit and browser tests
docs/               Atendimento JSON compatibility
scripts/            checks for exported files
.github/            CI, CodeQL, dependency review and Dependabot
```

Every push runs type checking, lint, unit tests, the production build and the
browser tests, plus a CodeQL scan. Production deploys on Vercel from `main`.

## Author

WorkFlow is created and maintained by **Zywl** ([GitHub](https://github.com/opZywl) · [lucas-lima.xyz](https://lucas-lima.xyz)).

## Issues

If you notice a bug or a missing feature, let me know by opening an
[issue](https://github.com/opZywl/flow/issues). Never attach a real export with
customer data, tokens or internal URLs; security reports go through a
[private advisory](https://github.com/opZywl/flow/security/advisories/new).

## License

Copyright (C) 2026 Zywl.

This project is subject to the [GNU General Public License v3.0](LICENSE). The
license covers the source code in this repository. Dependencies keep their own
licenses.

For those who are unfamiliar with the license, here is a summary of its main
points. This is by no means legal advice nor legally binding.

You are allowed to

- use
- share
- modify

this project entirely or partially for free and even commercially. However,
please consider the following:

- **You must disclose the source code of your modified work and the source code you took from this project. This means you are not allowed to use code from this project (even partially) in a closed-source or obfuscated application.**
- **Your modified application must also be licensed under the GPL.**

Do the above and share your source code with everyone, just like this project
does.

## Icons

Icons come from [Lucide](https://lucide.dev).

## Contributing

Contributions are welcome. Fork the repository, make your change and open a
pull request; the template lists the checks to run before you send it.

## Commits

`type: (scope) subject`, lowercase, no trailing period.

`feat` `fix` `refactor` `chore` `docs` `test`

Add a short body when the subject alone leaves the next reader guessing.
