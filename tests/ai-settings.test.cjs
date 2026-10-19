const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const STORE = path.join(ROOT, 'src/flow/ai/settings-store.ts')
const STUBS = { 'lucide-react': new Proxy({}, { get: () => () => null }) }
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveAlias(request, ...rest) {
  if (STUBS[request]) return `stub:${request}`
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest)
}
const load = Module._load
Module._load = function loadStub(request, ...rest) {
  return STUBS[request] ?? load.call(this, request, ...rest)
}

const KEY = 'sk-test-0123456789abcdefghijklmnop'

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (name) => (data.has(name) ? data.get(name) : null),
    setItem: (name, value) => data.set(name, String(value)),
    removeItem: (name) => data.delete(name),
    data,
  }
}

function fresh({ search = '', storage } = {}) {
  for (const id of Object.keys(require.cache)) if (id.includes(`${path.sep}src${path.sep}flow${path.sep}`)) delete require.cache[id]
  if (storage) global.window = { location: { search }, sessionStorage: storage }
  else delete global.window
  return require(STORE)
}

function loadSummary() {
  const file = path.join(ROOT, 'src/flow/ai-summary.tsx')
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  })
  const summary = new Module(file, module)
  summary.filename = file
  summary.paths = Module._nodeModulePaths(path.dirname(file))
  summary._compile(outputText, file)
  return summary.exports
}

test('sem o navegador, só o ChatGPT aparece, um provedor oculto vira o ChatGPT e nada é guardado', () => {
  const store = fresh()
  assert.deepEqual(store.visibleProviders().map((entry) => entry.id), ['openai'])
  assert.equal(store.readAiSettings().provider, 'openai')
  store.updateAiSettings({ provider: 'anthropic', keys: { openai: KEY } })
  assert.equal(store.readAiSettings().provider, 'openai')
  assert.equal(store.readAiSettings().keys.openai, KEY)
  store.resetAiSettings()
})

test('a chave, o modelo e o esforço ficam guardados na aba e voltam depois de recarregar a página', () => {
  const storage = memoryStorage()
  let store = fresh({ storage })
  assert.deepEqual(store.readAiSettings().keys, {})
  store.updateAiSettings({ keys: { openai: KEY }, models: { openai: 'gpt-6-astra' }, effortChoice: 'high', fill: false })
  const saved = JSON.parse(storage.getItem(store.AI_SETTINGS_STORAGE))
  assert.deepEqual(saved, { provider: 'openai', keys: { openai: KEY }, models: { openai: 'gpt-6-astra' }, effortChoice: 'high', fill: false })
  assert.equal(store.AI_SETTINGS_STORAGE, 'flow.ia')
  store = fresh({ storage })
  const settings = store.readAiSettings()
  assert.equal(settings.keys.openai, KEY)
  assert.equal(settings.models.openai, 'gpt-6-astra')
  assert.equal(settings.effortChoice, 'high')
  assert.equal(settings.fill, false)
  assert.deepEqual(settings.fetched, {})
  store.resetAiSettings()
  assert.equal(storage.getItem('flow.ia'), null)
  assert.deepEqual(fresh({ storage: memoryStorage() }).readAiSettings().keys, {}, 'uma aba nova começa sem a chave')
})

test('dados guardados inválidos ou de um provedor oculto são ignorados, e o armazenamento bloqueado não quebra o editor', () => {
  const broken = fresh({ storage: memoryStorage({ 'flow.ia': '{nao e json' }) })
  assert.equal(broken.readAiSettings().provider, 'openai')
  assert.deepEqual(broken.readAiSettings().keys, {})
  const odd = fresh({ storage: memoryStorage({ 'flow.ia': JSON.stringify({ provider: 'xai', keys: { openai: 42, xai: KEY, outro: KEY }, models: { openai: 'x'.repeat(200) }, effortChoice: 'turbo', fill: 'sim' }) }) })
  const settings = odd.readAiSettings()
  assert.equal(settings.provider, 'openai')
  assert.deepEqual(settings.keys, { xai: KEY })
  assert.deepEqual(settings.models, {})
  assert.equal(settings.effortChoice, null)
  assert.equal(settings.fill, true)
  const blocked = {
    getItem: () => {
      throw new Error('bloqueado')
    },
    setItem: () => {
      throw new Error('bloqueado')
    },
    removeItem: () => {
      throw new Error('bloqueado')
    },
  }
  const store = fresh({ storage: blocked })
  assert.equal(store.readAiSettings().provider, 'openai')
  store.updateAiSettings({ keys: { openai: KEY } })
  assert.equal(store.readAiSettings().keys.openai, KEY)
  store.resetAiSettings()
})

test('com ?ia=todos os quatro provedores aparecem e o provedor guardado vale', () => {
  const storage = memoryStorage({ 'flow.ia': JSON.stringify({ provider: 'google', keys: { google: KEY } }) })
  const store = fresh({ search: '?ia=todos', storage })
  assert.deepEqual(store.visibleProviders().map((entry) => entry.id), ['openai', 'anthropic', 'google', 'xai'])
  assert.equal(store.readAiSettings().provider, 'google')
  store.updateAiSettings({ provider: 'xai' })
  assert.equal(store.readAiSettings().provider, 'xai')
  assert.equal(fresh({ search: '?ia=outro', storage }).readAiSettings().provider, 'openai')
  store.resetAiSettings()
})

test('a janela Configurar IA abre no campo pedido com os erros, limpa um erro por vez e fecha sem erros', () => {
  const store = fresh()
  const seen = []
  const off = store.subscribeAiSettingsDialog(() => seen.push(store.readAiSettingsDialog()))
  assert.deepEqual(store.readAiSettingsDialog(), { open: false, focus: null, errors: {}, seq: 0 })
  store.openAiSettings({ focus: 'apiKey', errors: { apiKey: 'Informe a chave da API da OpenAI.', model: '', effort: undefined } })
  assert.deepEqual(store.readAiSettingsDialog(), { open: true, focus: 'apiKey', errors: { apiKey: 'Informe a chave da API da OpenAI.' }, seq: 1 })
  store.openAiSettings({ focus: 'model', errors: { model: 'Escolha um modelo válido.', apiKey: 'Informe a chave da API da OpenAI.' } })
  assert.equal(store.readAiSettingsDialog().seq, 2)
  store.clearAiSettingsErrors('apiKey')
  assert.deepEqual(store.readAiSettingsDialog().errors, { model: 'Escolha um modelo válido.' })
  const count = seen.length
  store.clearAiSettingsErrors('apiKey', 'effort')
  assert.equal(seen.length, count, 'limpar um erro que não existe não avisa ninguém')
  store.closeAiSettings()
  assert.deepEqual(store.readAiSettingsDialog(), { open: false, focus: null, errors: {}, seq: 2 })
  store.closeAiSettings()
  assert.equal(seen.length, count + 1)
  store.openAiSettings()
  assert.deepEqual(store.readAiSettingsDialog(), { open: true, focus: null, errors: {}, seq: 3 })
  off()
  store.resetAiSettings()
})

test('o resumo mostra o modelo e o esforço, avisa a chave que falta e traz o botão Configurar IA', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const store = fresh()
  const summary = loadSummary()
  const own = require(STORE)
  assert.equal(own, store)
  const html = renderToStaticMarkup(React.createElement(summary.AiSummary))
  assert.ok(html.includes('OpenAI · GPT-6.1 Sol · Esforço '), html)
  assert.ok(html.includes(summary.AI_SUMMARY_MISSING))
  assert.equal(summary.AI_SUMMARY_MISSING, 'Chave não informada')
  assert.match(html, /<button type="button" aria-haspopup="dialog"[^>]*>.*Configurar IA<\/button>/)
  assert.doesNotMatch(html, /[!—–]/)
  store.resetAiSettings()
})
