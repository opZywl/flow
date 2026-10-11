require('./register-typescript.cjs')
const fs = require('node:fs')
const path = require('node:path')
const { isDeepStrictEqual } = require('node:util')
const { importFlow, exportFlow, validateFlow, nextNodeId, edgeId } = require('../lib/atendimento/format.ts')

const file = process.argv[2]
if (!file) {
  process.stderr.write('Uso: npm run check:reference -- "caminho/arquivo.json"\n')
  process.exit(1)
}
if (!fs.existsSync(file)) {
  process.stderr.write(`Arquivo não encontrado: ${file}\n`)
  process.exit(1)
}

try {
  const content = fs.readFileSync(file, 'utf8')
  const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const flow = importFlow(content)
  const text = exportFlow(flow)
  const identical = text === raw
  const lossless = identical || isDeepStrictEqual(JSON.parse(text), JSON.parse(raw))
  const issues = validateFlow(flow)
  const roundTrip = !lossless ? 'com diferenças' : !identical ? 'sem perda de dados' : raw === content ? 'idêntico byte a byte' : 'idêntico, exceto o BOM'
  process.stdout.write(`${JSON.stringify({
    file: path.basename(file),
    roundTrip,
    nodes: flow.nodes.length,
    edges: flow.edges.length,
    edgesWithReferenceId: flow.edges.filter(edge => edge.id === edgeId(edge.source, edge.sourceHandle, edge.target)).length,
    types: [...new Set(flow.nodes.map(node => node.data.type))],
    nextNodeId: nextNodeId(flow.nodes),
    issues,
  }, null, 2)}\n`)
  if (!lossless || issues.length) process.exitCode = 1
} catch (error) {
  process.stderr.write(`Falha na verificação:\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
