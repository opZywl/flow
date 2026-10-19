const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const pkg = require('../package.json')

const ROOT = path.resolve(__dirname, '..')
const LOGS = path.join(os.tmpdir(), 'flow-verify')
const PORT = process.env.E2E_PORT || '3196'
const SOURCES = ['app', 'components', 'hooks', 'lib', 'src', 'styles', 'public', 'next.config.mjs', 'pnpm-lock.yaml', 'tailwind.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'components.json']
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const tool = (file) => path.join(ROOT, 'node_modules', file)

const argv = process.argv.slice(2)
const split = argv.indexOf('--')
const flags = new Set(split < 0 ? argv : argv.slice(0, split))
const e2eArgs = split < 0 ? [] : argv.slice(split + 1)
const known = ['--quick', '--no-e2e', '--build']
const unknown = [...flags].filter((flag) => !known.includes(flag))
if (unknown.length) {
  process.stderr.write(`Opção desconhecida: ${unknown.join(' ')}\nUso: npm run verify -- [--quick] [--no-e2e] [--build] [-- argumentos do Playwright]\n`)
  process.exit(1)
}

function newest(entry) {
  let stat
  try {
    stat = fs.statSync(path.join(ROOT, entry))
  } catch {
    return 0
  }
  if (!stat.isDirectory()) return stat.mtimeMs
  return fs.readdirSync(path.join(ROOT, entry)).reduce((latest, child) => Math.max(latest, newest(path.join(entry, child))), stat.mtimeMs)
}

function buildFresh() {
  try {
    const built = fs.statSync(path.join(ROOT, '.next', 'BUILD_ID')).mtimeMs
    return SOURCES.every((entry) => newest(entry) < built)
  } catch {
    return false
  }
}

function unitArgs() {
  const [command, ...rest] = pkg.scripts.test.split(/\s+/)
  if (command !== 'node') throw new Error('O script test do package.json precisa começar com node.')
  return ['--test-reporter=spec', ...rest]
}

function run(name, args, env = {}) {
  const log = path.join(LOGS, `${name}.log`)
  const started = Date.now()
  return new Promise((resolve) => {
    const out = fs.openSync(log, 'w')
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', out, out], env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env } })
    const finish = (code) => {
      fs.closeSync(out)
      const text = fs.readFileSync(log, 'utf8').replace(ANSI, '')
      resolve({ name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000), log, text })
    }
    child.on('error', () => finish(1))
    child.on('close', finish)
  })
}

const lines = (text) => text.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
const count = (text, pattern) => Number((text.match(pattern) || [])[1] || 0)
const amount = (value, one, many) => `${value} ${value === 1 ? one : many}`
const from = (text, marker, limit) => {
  const all = lines(text)
  const start = all.findIndex((line) => marker.test(line))
  return (start < 0 ? all.slice(-limit) : all.slice(start)).slice(0, limit)
}

const DETAILS = {
  unidade: {
    ok: (text) => `${count(text, /^ℹ pass (\d+)/m)} ok, ${amount(count(text, /^ℹ skipped (\d+)/m), 'pulado', 'pulados')}`,
    failed: (text) => from(text, /failing tests:/, 60),
  },
  tipos: { failed: (text) => lines(text).filter((line) => /error TS\d+/.test(line)).slice(0, 30) },
  lint: { failed: (text) => lines(text).filter((line) => !/next lint|codemod|ESLint CLI|create-next-app/.test(line)).slice(-30) },
  build: { failed: (text) => from(text, /Failed to compile|Type error|Error:/, 40) },
  e2e: {
    ok: (text) => [[/(\d+) passed/, 'ok', 'ok'], [/(\d+) flaky/, 'instável', 'instáveis'], [/(\d+) skipped/, 'pulado', 'pulados']].filter(([pattern]) => pattern.test(text)).map(([pattern, one, many]) => amount(count(text, pattern), one, many)).join(', '),
    failed: (text) => [...from(text, /^\s+1\) /, 80), ...lines(text).filter((line) => /^\s+\d+ (failed|flaky|passed|skipped)/.test(line))],
  },
}

function report(result) {
  const detail = DETAILS[result.name] || {}
  const label = result.name === 'build' ? 'build e tipos' : result.name
  const note = result.ok && detail.ok ? ` ${detail.ok(result.text)}` : ''
  process.stdout.write(`${result.ok ? 'ok    ' : 'FALHOU'}  ${label}${note} (${result.seconds}s)\n`)
  if (result.ok) return result
  const shown = detail.failed ? detail.failed(result.text) : lines(result.text).slice(-30)
  for (const line of shown) process.stdout.write(`        ${line}\n`)
  process.stdout.write(`        log completo: ${result.log}\n`)
  return result
}

async function main() {
  const started = Date.now()
  fs.mkdirSync(LOGS, { recursive: true })
  const quick = flags.has('--quick')
  const build = !quick && (flags.has('--build') || !buildFresh())
  if (!quick && !build) process.stdout.write('build atual, sem mudanças no código desde o último\n')
  const first = [run('unidade', unitArgs()), run('lint', [tool('next/dist/bin/next'), 'lint'])]
  first.push(build ? run('build', [tool('next/dist/bin/next'), 'build', '--no-lint']) : run('tipos', [tool('typescript/bin/tsc'), '--noEmit']))
  const results = await Promise.all(first.map((step) => step.then(report)))
  const builtOk = !build || results.find((result) => result.name === 'build').ok
  if (!quick && !flags.has('--no-e2e') && builtOk) {
    results.push(report(await run('e2e', [tool('@playwright/test/cli.js'), 'test', '--reporter=dot', ...e2eArgs], { E2E_PORT: PORT })))
  }
  const failed = results.filter((result) => !result.ok)
  const total = Math.round((Date.now() - started) / 1000)
  const time = `${Math.floor(total / 60)}m ${total % 60}s`
  process.stdout.write(failed.length ? `Falhou: ${failed.map((result) => result.name).join(', ')} (${time})\n` : `Tudo certo em ${time}\n`)
  process.exit(failed.length ? 1 : 0)
}

main()
