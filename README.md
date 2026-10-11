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
| library | every platform component by category, with search; click or drag to add |
| canvas | rule-checked connections (one input per component, one target per output), multi-select, undo and redo, minimap |
| components | a summary of each step, labeled outputs and a remove button on hover |
| panel | the fields of each component, menu options, business hours, technical fields and the full JSON |
| validation | live issues, each one jumps to the component that needs attention |
| preview | a simulated conversation with menus, answers, API results and business hours, without calling the platform |
| import | Atendimento JSON, older flows from this editor and AI generation |
| theme | light or dark, with the accent color you pick in Cores |

`Ctrl+Z` undoes, `Ctrl+Y` redoes, `Ctrl+S` saves, `Ctrl+K` searches the flow
and `Delete` removes the selection. Dropping a `.json` file on the canvas
imports it.

## Atendimento JSON compatibility

The format comes from a file exported by the platform itself, and that file is
the only source the editor follows:

- envelope with `name`, `description`, `service_type`, `created_at`, `nodes`, `edges` and `viewport`
- components as `type: "custom"` with `data.type`, `data.data` and `data.html`; the start is always `inicio` and every other component gets a sequential numeric ID
- `deletable` connections with `sourceHandle: "output-N"` and the id `xy-edge__<source><handle>-<target>`
- `created_at` stamped at export time, with the same serialization the platform uses

Twelve components have a real example in that file and are created with
exactly the same fields: Iniciar Fluxo, Menu de Opções, Enviar Mensagem,
Transferir para Departamento, Aplicar Tag, Transferir para Fluxo, Encerrar
Conversa, Condições de Tempo, Solicitar Dados, Protocolo, Consulta API and
Aguardando Mensagem.

The other fifty show up in the library as "sem JSON" and start working as soon
as there is a platform export with each one configured. Rules, output meanings
and the full list are in
[docs/atendimento-compatibilidade.md](docs/atendimento-compatibilidade.md).

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

AI generation runs on your own OpenAI key, typed into the dialog. The key is
sent only with the generation request and is not stored by the server.

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

Point `FLOW_REFERENCE` at a JSON exported by the platform and the unit and
browser tests also validate that file:

```sh
FLOW_REFERENCE="path/to/Atendimento.json" pnpm test
FLOW_REFERENCE="path/to/Atendimento.json" pnpm test:e2e
```

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
