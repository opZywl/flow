require('./register-typescript.cjs')
const fs = require('node:fs')
const path = require('node:path')
const { isDeepStrictEqual } = require('node:util')
const { importFlow, exportFlow, validateFlow, cleanDocument, stampExport, nextNodeId, edgeId } = require('../lib/atendimento/format.ts')
const { getDefinition } = require('../lib/atendimento/catalog.ts')

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
  const issues = validateFlow(flow)
  const errors = issues.filter(issue => issue.severity === 'error')
  const text = errors.length ? JSON.stringify(cleanDocument(flow), null, 2) : exportFlow(flow)
  const identical = text === raw
  const lossless = identical || isDeepStrictEqual(JSON.parse(text), JSON.parse(raw))
  const roundTrip = !lossless ? 'com diferenças' : !identical ? 'sem perda de dados, com outra formatação' : raw === content ? 'idêntico byte a byte' : 'idêntico, exceto o BOM'
  const createdAt = /"created_at": "[^"]*"/
  const stamped = errors.length ? '' : exportFlow(stampExport(flow, new Date(Date.parse(flow.created_at) + 1000 || 0)))
  const stampedRoundTrip = !stamped ? 'exportação bloqueada' : stamped.replace(createdAt, '') === raw.replace(createdAt, '') && stamped !== raw ? 'idêntico, exceto created_at' : 'com diferenças'
  const types = [...new Set(flow.nodes.map(node => node.data.type))]
  const typeOf = new Map(flow.nodes.map(node => [node.id, node.data.type]))
  process.stdout.write(`${JSON.stringify({
    file: path.basename(file),
    roundTrip,
    export: errors.length ? 'bloqueada por erros' : 'liberada',
    exportWithNewDate: stampedRoundTrip,
    nodes: flow.nodes.length,
    edges: flow.edges.length,
    edgesWithReferenceId: flow.edges.filter(edge => edge.id === edgeId(edge.source, edge.sourceHandle, edge.target)).length,
    types: types.length,
    typesWithoutDefinition: types.filter(type => !getDefinition(type)),
    nextNodeId: nextNodeId(flow.nodes),
    errors: errors.length,
    warnings: issues.length - errors.length,
    issues: issues.map(issue => ({ severity: issue.severity, component: issue.nodeId ? `${typeOf.get(issue.nodeId) ?? ''} ${issue.nodeId}`.trim() : undefined, message: issue.message })),
  }, null, 2)}\n`)
  if (!identical || errors.length || stampedRoundTrip !== 'idêntico, exceto created_at') process.exitCode = 1
} catch (error) {
  process.stderr.write(`Falha na verificação:\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
