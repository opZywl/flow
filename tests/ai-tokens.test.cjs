const { test } = require('node:test')
const assert = require('node:assert/strict')

const STORAGE = 'flow.ia.tokens'
const stored = new Map()
const events = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
  addEventListener: (type, listener) => events.set(type, listener),
  removeEventListener: (type) => events.delete(type),
}
stored.set(STORAGE, JSON.stringify({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }))

const tokens = require('../src/flow/ai/token-store.ts')

test('o total de tokens começa do que ficou guardado, soma cada uso e guarda de novo', () => {
  assert.equal(tokens.TOKENS_STORAGE, STORAGE)
  assert.deepEqual(tokens.readTokens(), { inputTokens: 100, outputTokens: 50, totalTokens: 150 })
  tokens.addTokens({ inputTokens: 11, outputTokens: 22, totalTokens: 33 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: 111, outputTokens: 72, totalTokens: 183 })
  assert.deepEqual(JSON.parse(stored.get(STORAGE)), { inputTokens: 111, outputTokens: 72, totalTokens: 183 })
  for (const invalid of [undefined, null, {}, { inputTokens: -1, outputTokens: 0, totalTokens: 0 }, { inputTokens: 1.5, outputTokens: Number.NaN, totalTokens: 'x' }]) tokens.addTokens(invalid)
  assert.deepEqual(tokens.readTokens(), { inputTokens: 111, outputTokens: 72, totalTokens: 183 })
})

test('o uso somado em outra aba aparece aqui e a próxima soma parte do total guardado', () => {
  const seen = []
  const stop = tokens.subscribeTokens(() => seen.push(tokens.readTokens().totalTokens))
  assert.equal(typeof events.get('storage'), 'function')
  stored.set(STORAGE, JSON.stringify({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }))
  events.get('storage')({ key: STORAGE })
  assert.deepEqual(seen, [300])
  stored.set(STORAGE, JSON.stringify({ inputTokens: 210, outputTokens: 120, totalTokens: 330 }))
  tokens.addTokens({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: 211, outputTokens: 122, totalTokens: 333 })
  assert.deepEqual(seen, [300, 333])
  stop()
  assert.equal(events.has('storage'), false)
})

test('o valor guardado ilegível segue do total desta aba e o total nunca fica abaixo de entrada mais saída', () => {
  stored.set(STORAGE, 'não é json')
  tokens.addTokens({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: 212, outputTokens: 123, totalTokens: 335 })
  assert.deepEqual(JSON.parse(stored.get(STORAGE)), { inputTokens: 212, outputTokens: 123, totalTokens: 335 })
  stored.set(STORAGE, JSON.stringify({ inputTokens: 10, outputTokens: 10, totalTokens: 5 }))
  tokens.addTokens({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: 11, outputTokens: 11, totalTokens: 22 })
})

test('sem acesso ao armazenamento o total continua somando nesta aba', () => {
  const { getItem, setItem } = window.localStorage
  window.localStorage.getItem = () => {
    throw new Error('bloqueado')
  }
  window.localStorage.setItem = () => {
    throw new Error('bloqueado')
  }
  const before = tokens.readTokens()
  tokens.addTokens({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
  tokens.addTokens({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: before.inputTokens + 4, outputTokens: before.outputTokens + 5, totalTokens: before.totalTokens + 9 })
  window.localStorage.getItem = getItem
  window.localStorage.setItem = setItem
})

test('com o armazenamento cheio o total desta aba continua somando, não volta ao valor guardado e grava tudo quando houver espaço', () => {
  const { setItem } = window.localStorage
  window.localStorage.setItem = () => {
    throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
  }
  const before = tokens.readTokens()
  const saved = stored.get(STORAGE)
  const expected = { inputTokens: before.inputTokens + 4, outputTokens: before.outputTokens + 5, totalTokens: before.totalTokens + 9 }
  let stop = () => undefined
  try {
    tokens.addTokens({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
    tokens.addTokens({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })
    assert.deepEqual(tokens.readTokens(), expected)
    assert.equal(stored.get(STORAGE), saved)
    stop = tokens.subscribeTokens(() => undefined)
    assert.deepEqual(tokens.readTokens(), expected)
    events.get('storage')({ key: STORAGE })
    assert.deepEqual(tokens.readTokens(), expected)
  } finally {
    stop()
    window.localStorage.setItem = setItem
  }
  tokens.addTokens({ inputTokens: 1, outputTokens: 0, totalTokens: 1 })
  const after = { inputTokens: expected.inputTokens + 1, outputTokens: expected.outputTokens, totalTokens: expected.totalTokens + 1 }
  assert.deepEqual(tokens.readTokens(), after)
  assert.deepEqual(JSON.parse(stored.get(STORAGE)), after)
})

test('o total que outra aba guardou enquanto nada ouvia aparece quando o Copiloto abre', () => {
  const file = require.resolve('../src/flow/ai/token-store.ts')
  delete require.cache[file]
  const fresh = require(file)
  stored.set(STORAGE, JSON.stringify({ inputTokens: 400, outputTokens: 200, totalTokens: 600 }))
  const stop = fresh.subscribeTokens(() => undefined)
  assert.deepEqual(fresh.readTokens(), { inputTokens: 400, outputTokens: 200, totalTokens: 600 })
  stop()
})
