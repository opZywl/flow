const { test } = require('node:test')
const assert = require('node:assert/strict')

const STORAGE = 'flow.ia.tokens'
const FILE = require.resolve('../src/flow/ai/token-store.ts')

function fakeIndexedDB(initial) {
  const records = new Map(initial ? [['total', initial]] : [])
  const queue = []
  const writes = []
  let created = Boolean(initial)
  let running = false
  let failures = 0
  let broken = false
  const run = () => {
    if (running) return
    const transaction = queue.shift()
    if (!transaction) return
    running = true
    setTimeout(() => {
      if (failures > 0 && transaction.mode === 'readwrite') {
        failures--
        transaction.requests.length = 0
        transaction.onerror?.()
        transaction.onabort?.()
      } else {
        while (transaction.requests.length) transaction.requests.shift()()
        if (transaction.mode === 'readwrite') writes.push(structuredClone(records.get('total')))
        transaction.oncomplete?.()
      }
      running = false
      run()
    }, 1)
  }
  const db = {
    createObjectStore() {
      created = true
      return { put: (value, key) => records.set(key, structuredClone(value)) }
    },
    transaction(name, mode) {
      const transaction = { mode, requests: [] }
      transaction.objectStore = () => ({
        get(key) {
          const request = {}
          transaction.requests.push(() => {
            request.result = structuredClone(records.get(key))
            request.onsuccess?.()
          })
          return request
        },
        put(value, key) {
          transaction.requests.push(() => records.set(key, structuredClone(value)))
          return {}
        },
      })
      queue.push(transaction)
      run()
      return transaction
    },
  }
  return {
    records,
    writes,
    opened: [],
    fail(count) {
      failures = count
    },
    breakOpen() {
      broken = true
    },
    idle: () => !running && queue.length === 0,
    failuresLeft: () => failures,
    open(name, version) {
      this.opened.push([name, version])
      const request = {}
      setTimeout(() => {
        if (broken) return request.onerror?.()
        request.result = db
        if (!created) request.onupgradeneeded?.()
        request.onsuccess?.()
      }, 1)
      return request
    },
  }
}

function browserWith(indexedDB, saved) {
  const stored = new Map(saved ? [[STORAGE, JSON.stringify(saved)]] : [])
  const listeners = new Set()
  globalThis.window = {
    indexedDB,
    localStorage: {
      getItem: (key) => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key),
    },
    addEventListener: (type, listener) => type === 'storage' && listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  }
  return { stored, fire: () => [...listeners].forEach((listener) => listener({ key: STORAGE })), listeners }
}

function tab() {
  delete require.cache[FILE]
  return require(FILE)
}

async function until(check) {
  for (let index = 0; index < 400; index++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail('a condição não chegou a tempo')
}

const usage = (inputTokens, outputTokens) => ({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })

test('o total antigo do localStorage passa para o IndexedDB, cada uso entra uma vez e a cópia no localStorage acompanha', async () => {
  const db = fakeIndexedDB()
  const { stored } = browserWith(db, usage(100, 50))
  const tokens = tab()
  assert.deepEqual(tokens.readTokens(), usage(100, 50))
  tokens.addTokens(usage(11, 22))
  assert.deepEqual(tokens.readTokens(), usage(111, 72))
  await until(() => db.idle() && db.writes.length === 1)
  assert.deepEqual(db.opened, [['flow.ia', 1]])
  assert.deepEqual(db.records.get('total'), usage(111, 72))
  assert.deepEqual(JSON.parse(stored.get(STORAGE)), usage(111, 72))
  assert.deepEqual(tokens.readTokens(), usage(111, 72))
})

test('duas abas que terminam chamadas ao mesmo tempo somam as duas, porque cada soma lê e grava na mesma transação', async () => {
  const db = fakeIndexedDB()
  const { fire } = browserWith(db)
  const first = tab()
  const second = tab()
  const stops = [first.subscribeTokens(() => undefined), second.subscribeTokens(() => undefined)]
  first.addTokens(usage(10, 20))
  second.addTokens(usage(100, 200))
  await until(() => db.idle() && db.writes.length === 2)
  assert.deepEqual(db.records.get('total'), usage(110, 220))
  fire()
  await until(() => first.readTokens().totalTokens === 330 && second.readTokens().totalTokens === 330)
  assert.deepEqual(first.readTokens(), usage(110, 220))
  assert.deepEqual(second.readTokens(), usage(110, 220))
  for (const stop of stops) stop()
})

test('a soma que chega enquanto a gravação anterior não terminou entra na gravação seguinte', async () => {
  const db = fakeIndexedDB()
  browserWith(db)
  const tokens = tab()
  tokens.addTokens(usage(1, 2))
  tokens.addTokens(usage(3, 4))
  tokens.addTokens(usage(5, 6))
  assert.deepEqual(tokens.readTokens(), usage(9, 12))
  await until(() => db.idle() && db.records.get('total')?.totalTokens === 21)
  assert.deepEqual(db.records.get('total'), usage(9, 12))
  assert.deepEqual(tokens.readTokens(), usage(9, 12))
})

test('a gravação que falha no IndexedDB fica nesta aba e entra na próxima soma', async () => {
  const db = fakeIndexedDB()
  const { stored } = browserWith(db)
  const tokens = tab()
  db.fail(1)
  tokens.addTokens(usage(1, 1))
  await until(() => db.idle() && db.failuresLeft() === 0)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(db.records.get('total'), undefined)
  assert.equal(stored.get(STORAGE), undefined)
  assert.deepEqual(tokens.readTokens(), usage(1, 1))
  tokens.addTokens(usage(3, 4))
  assert.deepEqual(tokens.readTokens(), usage(4, 5))
  await until(() => db.idle() && db.records.get('total')?.totalTokens === 9)
  assert.deepEqual(db.records.get('total'), usage(4, 5))
  assert.deepEqual(JSON.parse(stored.get(STORAGE)), usage(4, 5))
  assert.deepEqual(tokens.readTokens(), usage(4, 5))
})

test('abrir o Copiloto lê o total que outra aba gravou no IndexedDB enquanto nada ouvia', async () => {
  const db = fakeIndexedDB(usage(400, 200))
  browserWith(db, usage(10, 10))
  const tokens = tab()
  assert.deepEqual(tokens.readTokens(), usage(10, 10))
  const stop = tokens.subscribeTokens(() => undefined)
  await until(() => tokens.readTokens().totalTokens === 600)
  assert.deepEqual(tokens.readTokens(), usage(400, 200))
  stop()
})

test('sem IndexedDB que abra, o total segue pelo localStorage', async () => {
  const db = fakeIndexedDB()
  db.breakOpen()
  const { stored } = browserWith(db, usage(5, 5))
  const tokens = tab()
  tokens.addTokens(usage(1, 2))
  assert.deepEqual(tokens.readTokens(), usage(6, 7))
  await until(() => stored.get(STORAGE) === JSON.stringify(usage(6, 7)))
  assert.deepEqual(tokens.readTokens(), usage(6, 7))
  assert.equal(db.records.size, 0)
})
