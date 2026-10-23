const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const Module = require('node:module')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = path.resolve(__dirname, '..')
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveAlias(request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest)
}

const {
  API_CHECK_TYPES, TEST_ERROR_MESSAGES, TEST_LIMITS, apiPlan, blockedAddress, canonicalJson, checkTestUrl, classifyResponse, clearedValidation, failedOutcome, fillBody, fillVariables,
  formatDuration, headerPairs, initialValues, missingUrls, parseTestRequest, planKey, planTokens, planVariables, sha256Hex, targetProblem, testRequest, testedCalls, validationPatch,
  validationSignature, variablesIn,
} = require('../lib/atendimento/api-check.ts')
const { createTestApiHandler } = require('../lib/atendimento/api-test-handler.ts')
const route = require('../app/api/test-api/route.ts')
const { getDefinition } = require('../lib/atendimento/catalog.ts')

const ORIGIN = 'http://localhost:3000'
const API = 'https://api.lucas-lima.xyz/v1/clientes'
const DASHES = /[\u2013\u2014]/
const servers = []

after(async () => {
  await Promise.all(servers.map((entry) => entry.close()))
})

const shapeOf = (type) => {
  const definition = getDefinition(type)
  return definition.configured ? definition.configured() : definition.defaults()
}
const hash = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')

async function serve(routes) {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
      const handle = routes[req.url.split('?')[0]] || routes['*']
      if (handle) handle(req, res)
      else {
        res.statusCode = 404
        res.end('sem rota')
      }
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const entry = {
    port,
    requests,
    url: (route = '/') => `http://127.0.0.1:${port}${route}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
  servers.push(entry)
  return entry
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  res.end(JSON.stringify(value))
}

async function call(handler, input, headers = {}) {
  const merged = Object.fromEntries(Object.entries({ 'content-type': 'application/json', origin: ORIGIN, ...headers }).filter(([, value]) => value !== undefined))
  const response = await handler(new Request(`${ORIGIN}/api/test-api`, { method: 'POST', headers: merged, body: typeof input === 'string' ? input : JSON.stringify(input) }))
  return { status: response.status, headers: response.headers, body: await response.json() }
}

const only = (port) => (address, target) => target === port

test('every API component maps to the calls it makes, with label, method and test values key', () => {
  assert.deepEqual([...API_CHECK_TYPES].sort(), ['External_Message_Http', 'Send_DataStore', 'api_options_menu', 'consulta_api', 'envio_boletos', 'protocolo', 'solicitar_dados'])
  const consulta = apiPlan('consulta_api', { ...shapeOf('consulta_api'), url_api: ` ${API} `, body_value: '{"cpf": "{{cpf}}"}', headers: [{ Authorization: 'Bearer {{token}}' }] })
  assert.deepEqual(consulta, {
    type: 'consulta_api',
    calls: [{ key: 'url_api', label: 'URL da API', url: API, method: 'POST', headers: [['Authorization', 'Bearer {{token}}']], body: '{"cpf": "{{cpf}}"}', optional: false }],
    stores: true,
    testValuesKey: 'api_test_values',
  })
  const request = apiPlan('solicitar_dados', { ...shapeOf('solicitar_dados'), url_api: API, method: 'GET' })
  assert.equal(request.stores, true)
  assert.equal(request.testValuesKey, undefined)
  assert.equal(request.calls[0].method, 'GET')
  assert.equal(apiPlan('consulta_api', { url_api: API }).calls[0].method, 'POST')
  assert.equal(apiPlan('consulta_api', { url_api: API, method: 'TRACE' }).calls[0].problem, 'Corrija o método HTTP no componente: use GET, POST, PUT, PATCH ou DELETE.')
  assert.equal(apiPlan('consulta_api', { url_api: API, method: '' }).calls[0].problem, 'Corrija o método HTTP no componente: use GET, POST, PUT, PATCH ou DELETE.')

  assert.equal(apiPlan('protocolo', { ...shapeOf('protocolo'), url_api: API }), undefined)
  assert.deepEqual(apiPlan('protocolo', { ...shapeOf('protocolo'), opt: 'URL', url_api: API }), {
    type: 'protocolo',
    calls: [{ key: 'url_api', label: 'URL da API', url: API, optional: false, method: 'GET', choices: ['GET', 'POST'], headers: [], body: '' }],
    stores: false,
  })
  for (const type of ['External_Message_Http', 'Send_DataStore']) {
    const plan = apiPlan(type, { ...shapeOf(type), url_api: API, method: 'PUT' })
    assert.deepEqual(plan.calls, [{ key: 'url_api', label: 'URL da API', url: API, optional: false, method: 'PUT', headers: [], body: '' }], type)
    assert.equal(plan.stores, false, type)
  }
  const menu = apiPlan('api_options_menu', { ...shapeOf('api_options_menu'), apiUrl: API })
  assert.deepEqual(menu.calls.map((entry) => [entry.key, entry.label, entry.url, entry.method, entry.choices, entry.optional]), [
    ['apiUrl', 'URL da API das opções', API, 'GET', ['GET', 'POST'], false],
    ['postUrl', 'URL de envio da opção escolhida', '', 'POST', ['GET', 'POST'], true],
  ])
  assert.deepEqual(missingUrls(menu), [])
  assert.deepEqual(testedCalls(menu).map((entry) => entry.key), ['apiUrl'])
  const invoices = apiPlan('envio_boletos', { ...shapeOf('envio_boletos'), url_list: API })
  assert.deepEqual(invoices.calls.map((entry) => [entry.key, entry.label, entry.method]), [['url_list', 'URL da API que lista os boletos', 'GET'], ['url_send', 'URL da API que envia os boletos', 'POST']])
  assert.deepEqual(missingUrls(invoices).map((entry) => entry.key), ['url_send'])
  assert.equal(apiPlan('envio_pergunta', { template: API }), undefined)
  assert.equal(apiPlan('condicional_api', { key: API }), undefined)
})

test('headers are read from the shapes a component can hold', () => {
  assert.deepEqual(headerPairs([{ Authorization: 'Bearer x', 'X-Id': 7 }]), [['Authorization', 'Bearer x'], ['X-Id', '7']])
  assert.deepEqual(headerPairs([{ key: 'X-Key', value: 'a' }, { name: 'X-Name', value: 'b' }, { header: 'X-Header', value: true }]), [['X-Key', 'a'], ['X-Name', 'b'], ['X-Header', 'true']])
  assert.deepEqual(headerPairs(['Accept: application/json', ['X-Pair', 'c'], 'sem separador']), [['Accept', 'application/json'], ['X-Pair', 'c']])
  assert.deepEqual(headerPairs({ Authorization: 'Bearer y' }), [['Authorization', 'Bearer y']])
  assert.deepEqual(headerPairs([{ key: 'X-Off', value: 'a', disabled: true }, { key: 'X-On', value: 'b', enabled: true }, { ' ': 'x' }, { nested: { a: 1 } }]), [['X-On', 'b']])
  assert.deepEqual(headerPairs(undefined), [])
  assert.deepEqual(headerPairs('Authorization: x'), [])
})

test('variables come from the URL, headers and body in both syntaxes and are filled safely', () => {
  assert.deepEqual(variablesIn('https://x.com/{{ id }}?q=@@@nome&c=@@@custom:ab12:campo&d={{id}}'), ['id', 'nome', 'custom:ab12:campo'])
  assert.deepEqual(variablesIn('{{nome cliente}} #NAME {protocol}'), [])
  const plan = apiPlan('consulta_api', { url_api: 'https://x.com/clientes/{{cpf}}', headers: [{ Authorization: 'Bearer @@@token' }], body_value: '{"nome": "{{nome}}", "cpf": "{{cpf}}"}', api_test_values: { cpf: '123', outra: 'x', nome: 7 } })
  assert.deepEqual(planTokens(plan), [{ name: 'cpf', token: '{{cpf}}' }, { name: 'token', token: '@@@token' }, { name: 'nome', token: '{{nome}}' }])
  assert.deepEqual(planVariables(plan), ['cpf', 'token', 'nome'])
  assert.deepEqual(initialValues(plan, { api_test_values: { cpf: '123', outra: 'x', nome: 7 } }), { cpf: '123', token: '', nome: '7' })
  assert.deepEqual(initialValues(apiPlan('solicitar_dados', { url_api: API, body_value: '{"cpf":"{{input}}"}', api_test_values: { input: '9' } }), { api_test_values: { input: '9' } }), { input: '' })
  assert.deepEqual(planVariables(apiPlan('envio_boletos', { url_list: '', url_send: 'https://x.com/{{id}}' })), ['id'])

  assert.equal(fillVariables('https://x.com/{{cpf}}?nome={{nome}}&x={{falta}}', { cpf: '123.456', nome: 'Ana Maria & Cia' }, encodeURIComponent), 'https://x.com/123.456?nome=Ana%20Maria%20%26%20Cia&x={{falta}}')
  const body = fillBody('{"nome": "{{nome}}", "idade": {{idade}}, "nota": "@@@nota", "lista": ["{{nome}}"]}', { nome: 'Ana "A" \\ B', idade: '30', nota: 'linha 1\nlinha 2' })
  assert.deepEqual(JSON.parse(body), { nome: 'Ana "A" \\ B', idade: 30, nota: 'linha 1\nlinha 2', lista: ['Ana "A" \\ B'] })
  assert.equal(fillBody('{"texto": "aspas \\" {{x}}"}', { x: 'a"b' }), '{"texto": "aspas \\" a\\"b"}')
  assert.equal(fillBody('cpf={{cpf}}&nome={{nome}}', { cpf: '1', nome: 'a"b' }), 'cpf=1&nome=a"b')

  const [first] = plan.calls
  assert.deepEqual(testRequest(first, { cpf: '1 2', token: 'abc', nome: 'Ana' }), {
    url: 'https://x.com/clientes/1%202',
    method: 'POST',
    headers: [['Authorization', 'Bearer abc']],
    body: '{"nome": "Ana", "cpf": "1 2"}',
  })
  assert.deepEqual(testRequest(first, { cpf: '1', token: 'abc', nome: 'Ana' }, 'GET'), { url: 'https://x.com/clientes/1', method: 'GET', headers: [['Authorization', 'Bearer abc']] })
  assert.equal(testRequest(first, {}, 'TRACE').method, 'POST')
})

test('the signature is a deterministic SHA-256 of the canonical API fields', () => {
  for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'b'.repeat(119), 'c'.repeat(120), 'validação ção 𝄞', 'x'.repeat(200000)]) assert.equal(sha256Hex(text), hash(text), `tamanho ${text.length}`)
  assert.equal(canonicalJson({ b: [2, { d: 1, c: null }], a: 'x', é: true }), '{"a":"x","b":[2,{"c":null,"d":1}],"é":true}')
  const data = { url_api: API, method: 'POST', headers: [{ 'X-Token': 'abc', Accept: 'application/json' }], body_value: '{"cpf":"{{cpf}}"}', text: 'mensagem' }
  const signature = validationSignature(data)
  assert.match(signature, /^[0-9a-f]{64}$/)
  assert.equal(signature, hash(`{"body_value":"{\\"cpf\\":\\"{{cpf}}\\"}","headers":[{"Accept":"application/json","X-Token":"abc"}],"method":"POST","url_api":"${API}"}`))
  assert.equal(validationSignature({ ...data, text: 'outra', headers: [{ Accept: 'application/json', 'X-Token': 'abc' }] }), signature)
  for (const change of [{ url_api: `${API}/2` }, { method: 'PUT' }, { headers: [] }, { body_value: '{}' }]) assert.notEqual(validationSignature({ ...data, ...change }), signature, JSON.stringify(change))
  assert.equal(validationSignature({ url_api: API }), hash(`{"body_value":"","headers":[],"method":"POST","url_api":"${API}"}`))

  const plan = apiPlan('consulta_api', data)
  assert.equal(planKey(plan), planKey(apiPlan('consulta_api', { ...data, text: 'outra' })))
  assert.notEqual(planKey(plan), planKey(apiPlan('consulta_api', { ...data, url_api: `${API}/2` })))
  assert.notEqual(planKey(apiPlan('External_Message_Http', { url_api: API })), planKey(apiPlan('Send_DataStore', { url_api: API })))
})

test('the validation patch only writes keys the component type has', () => {
  const data = { ...shapeOf('consulta_api'), url_api: API, body_value: '{"cpf": "{{cpf}}"}' }
  const patch = validationPatch('consulta_api', data, { cpf: '12345678900' })
  assert.deepEqual(patch, { isApiValidated: true, validated_signature: validationSignature(data), parsed_body: { cpf: '{{cpf}}' }, api_test_values: { cpf: '12345678900' } })
  assert.deepEqual(validationPatch('consulta_api', { ...data, body_value: 'cpf={{cpf}}' }, {}), { isApiValidated: true, validated_signature: validationSignature({ ...data, body_value: 'cpf={{cpf}}' }), api_test_values: {} })
  assert.equal('parsed_body' in validationPatch('consulta_api', { ...data, body_value: '[1, 2]' }, {}), false)
  assert.equal('parsed_body' in validationPatch('consulta_api', { ...data, body_value: '{"idade": {{idade}}}' }, {}), false)
  const request = { ...shapeOf('solicitar_dados'), url_api: API, body_value: '{"cpf":"{{input}}"}' }
  assert.deepEqual(validationPatch('solicitar_dados', request, { input: '1' }), { isApiValidated: true, validated_signature: validationSignature(request), parsed_body: { cpf: '{{input}}' } })
  for (const type of API_CHECK_TYPES) {
    const shape = shapeOf(type)
    const written = validationPatch(type, { ...shape, url_api: API, body_value: '{"a":"b"}' }, { a: 'b' })
    for (const key of Object.keys(written)) assert.ok(Object.prototype.hasOwnProperty.call(shape, key), `${type}.${key}`)
    for (const key of Object.keys(clearedValidation(type))) assert.ok(Object.prototype.hasOwnProperty.call(shape, key), `${type}.${key}`)
  }
  for (const type of ['External_Message_Http', 'Send_DataStore', 'protocolo', 'api_options_menu', 'envio_boletos']) {
    assert.deepEqual(validationPatch(type, { url_api: API }, { a: 'b' }), {}, type)
    assert.deepEqual(clearedValidation(type), {}, type)
  }
  assert.deepEqual(clearedValidation('consulta_api'), { isApiValidated: false, validated_signature: '' })
})

test('results are classified in Portuguese with a clear reason for each failure', () => {
  const valid = classifyResponse({ ok: true, status: 200, statusText: 'OK', timeMs: 119.6, contentType: 'application/json', json: { nome: 'Ana', plano: { id: 7, itens: [{ sku: 'a' }] }, vazio: {} }, truncated: false })
  assert.deepEqual(valid, { valid: true, message: 'Respondeu com status 200 OK em 120 ms.', status: 200, timeMs: 120, fields: ['nome', 'plano.id', 'plano.itens.0.sku', 'vazio'], moreFields: 0, preview: '{"nome":"Ana","plano":{"id":7,"itens":[{"sku":"a"}]},"vazio":{}}' })
  const many = classifyResponse({ ok: true, status: 201, timeMs: 1234, json: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`campo${index}`, index])) })
  assert.equal(many.message, 'Respondeu com status 201 em 1,2 s.')
  assert.equal(many.fields.length, 12)
  assert.equal(many.moreFields, 3)
  assert.deepEqual(classifyResponse({ ok: false, status: 404, statusText: 'Not Found', timeMs: 80, json: { erro: 'Cliente não encontrado' } }), {
    valid: false, message: 'A API respondeu com status 404 Not Found. Confira a URL.', status: 404, timeMs: 80, fields: ['erro'], moreFields: 0, preview: '{"erro":"Cliente não encontrado"}',
  })
  const expected = {
    400: 'Confira o corpo e os valores de teste.', 401: 'Confira os cabeçalhos de autenticação.', 403: 'Confira os cabeçalhos de autenticação.', 405: 'Confira o método HTTP.', 429: 'A API limitou as chamadas. Aguarde e teste de novo.',
    500: 'O servidor da API falhou ao responder.', 503: 'O servidor da API falhou ao responder.', 304: 'A API pediu um redirecionamento sem destino.',
  }
  for (const [status, hint] of Object.entries(expected)) {
    const outcome = classifyResponse({ ok: false, status: Number(status), statusText: 'Texto', text: 'falhou   de novo' })
    assert.equal(outcome.valid, false)
    assert.equal(outcome.message, `A API respondeu com status ${status} Texto. ${hint}`)
    assert.equal(outcome.preview, 'falhou de novo')
  }
  assert.equal(classifyResponse({ ok: false, status: 418 }).message, 'A API respondeu com status 418.')
  const large = classifyResponse({ ok: true, status: 200, statusText: 'OK', timeMs: 10, text: 'x'.repeat(5000), truncated: true })
  assert.equal(large.valid, false)
  assert.equal(large.message, 'Resposta grande demais. A API devolveu mais de 256 KB.')
  assert.equal(large.preview.length, 300)
  assert.ok(large.preview.endsWith('…'))
  for (const [code, message] of Object.entries(TEST_ERROR_MESSAGES)) {
    const outcome = classifyResponse({ ok: false, timeMs: 5, error: { code, message: '' } })
    assert.deepEqual([outcome.valid, outcome.message, outcome.timeMs], [false, message, 5], code)
  }
  assert.equal(classifyResponse({ ok: false, error: { code: 'forbidden_header', message: 'Cabeçalho não permitido no teste: Host.' } }).message, 'Cabeçalho não permitido no teste: Host.')
  assert.equal(classifyResponse({ ok: false, error: { code: 'invasor', message: 'texto qualquer' } }).message, TEST_ERROR_MESSAGES.unknown)
  assert.equal(classifyResponse({ ok: false }).message, TEST_ERROR_MESSAGES.unknown)
  assert.equal(failedOutcome('timeout').message, 'Tempo esgotado. A API não respondeu em 10 segundos.')
  assert.equal(TEST_LIMITS.timeoutMs, 10000)
  assert.deepEqual([formatDuration(0), formatDuration(999.4), formatDuration(1000), formatDuration(10049)], ['0 ms', '999 ms', '1,0 s', '10,0 s'])
})

test('messages and interface texts have no exclamation marks or dashes', () => {
  const messages = [
    ...Object.values(TEST_ERROR_MESSAGES),
    ...[200, 301, 400, 401, 404, 405, 408, 410, 413, 415, 422, 429, 500].map((status) => classifyResponse({ ok: false, status, statusText: 'X', timeMs: 1 }).message),
    classifyResponse({ ok: true, status: 200, timeMs: 1, truncated: true }).message,
    apiPlan('consulta_api', { url_api: API, method: 'X' }).calls[0].problem,
    ...[{}, { url: 'ftp://x' }, { url: 'https://a:b@x.com' }, { url: `https://x.com/${'a'.repeat(2100)}` }, { url: API, method: 'TRACE' }, { url: API, method: 'GET', headers: [['Host', 'x']] }, { url: API, method: 'GET', headers: [['X Y', 'x']] }, { url: API, method: 'GET', headers: [['X-Y', 'a\nb']] }].map((input) => parseTestRequest(input).error.message),
  ]
  for (const message of messages) {
    assert.ok(message && !message.includes('!') && !DASHES.test(message), message)
    assert.match(message, /^[A-ZÁÉÍÓÚ].*\.$/, message)
  }
  const sources = ['lib/atendimento/api-check.ts', 'lib/atendimento/api-test-handler.ts', 'src/flow/api-validation.tsx', 'app/api/test-api/route.ts'].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  for (const source of sources) {
    assert.ok(!DASHES.test(source))
    assert.ok(!/(^|\s|\{)(\/\/|\/\*)/m.test(source), 'sem comentários')
  }
  const texts = [...sources[2].matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]*[A-Za-zÀ-ú][^<>{}\n]*)</g)].map((match) => match[1] ?? match[2] ?? match[3])
  assert.ok(texts.some((text) => text.includes('Deseja fazer uma validação?')))
  for (const text of texts.filter((entry) => /[A-Za-zÀ-ú]/.test(entry))) assert.ok(!text.includes('!'), text)
})

test('test requests are checked before anything is sent', () => {
  const fail = (input) => parseTestRequest(input).error
  assert.deepEqual(fail(null), { code: 'invalid_request', message: TEST_ERROR_MESSAGES.invalid_request })
  assert.equal(fail({ method: 'GET' }).code, 'invalid_url')
  assert.equal(fail({ url: 'ftp://x.com/a', method: 'GET' }).code, 'invalid_url')
  assert.equal(fail({ url: 'javascript:alert(1)', method: 'GET' }).code, 'invalid_url')
  assert.equal(fail({ url: 'x.com/api', method: 'GET' }).code, 'invalid_url')
  assert.deepEqual(fail({ url: 'https://user:senha@x.com/', method: 'GET' }), { code: 'invalid_url', message: 'URL inválida. Tire o usuário e a senha do endereço e use um cabeçalho de autenticação.' })
  assert.deepEqual(fail({ url: `https://x.com/${'a'.repeat(2040)}`, method: 'GET' }), { code: 'invalid_url', message: 'URL inválida. O endereço passa de 2048 caracteres.' })
  assert.equal(fail({ url: API, method: 'TRACE' }).code, 'invalid_method')
  assert.equal(fail({ url: API, method: 7 }).code, 'invalid_method')
  assert.equal(fail({ url: API, method: 'GET', headers: { a: 'b' } }).code, 'invalid_headers')
  assert.equal(fail({ url: API, method: 'GET', headers: Array.from({ length: 31 }, (_, index) => [`X-${index}`, 'a']) }).code, 'invalid_headers')
  assert.equal(fail({ url: API, method: 'GET', headers: [['X-A']] }).code, 'invalid_headers')
  assert.equal(fail({ url: API, method: 'GET', headers: [['X-A', 1]] }).code, 'invalid_headers')
  assert.deepEqual(fail({ url: API, method: 'GET', headers: [['Nome Ruim', 'a']] }), { code: 'invalid_headers', message: 'Cabeçalho inválido: “Nome Ruim”. Use só letras, números e hífen no nome.' })
  assert.deepEqual(fail({ url: API, method: 'GET', headers: [['X-A', 'linha\r\nX-B: injetado']] }), { code: 'invalid_headers', message: 'Valor inválido no cabeçalho X-A. Use texto sem quebra de linha, até 8192 caracteres.' })
  assert.equal(fail({ url: API, method: 'GET', headers: [['X-A', 'x'.repeat(8193)]] }).code, 'invalid_headers')
  assert.equal(fail({ url: API, method: 'GET', headers: [['X-A', 'ção €']] }).code, 'invalid_headers')
  for (const name of ['Host', 'content-length', 'Connection', 'Transfer-Encoding', 'Keep-Alive', 'Upgrade', 'TE', 'Expect', 'Proxy-Authorization']) {
    assert.deepEqual(fail({ url: API, method: 'GET', headers: [[name, 'x']] }), { code: 'forbidden_header', message: `Cabeçalho não permitido no teste: ${name}.` }, name)
  }
  assert.equal(fail({ url: API, method: 'POST', body: 'x'.repeat(100 * 1024 + 1) }).code, 'body_too_large')
  assert.equal(fail({ url: API, method: 'POST', body: 'ç'.repeat(51300) }).code, 'body_too_large')
  assert.equal(fail({ url: API, method: 'POST', body: { a: 1 } }).code, 'invalid_request')
  assert.deepEqual(parseTestRequest({ url: `${API}?q=1 2`, method: 'post', headers: [['Authorization', 'Bearer x']], body: '{"a":1}' }), { ok: true, request: { url: `${API}?q=1%202`, method: 'POST', headers: [['Authorization', 'Bearer x']], body: '{"a":1}' } })
  assert.deepEqual(parseTestRequest({ url: API, method: 'GET', body: '{"a":1}' }), { ok: true, request: { url: API, method: 'GET', headers: [] } })
  assert.equal(checkTestUrl('https://x.com/a').ok, true)
})

test('blocked addresses cover loopback, private, link-local, CGNAT, multicast, reserved and mapped forms', () => {
  const blocked = ['127.0.0.1', '127.255.0.9', '0.0.0.0', '0.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '100.127.255.255', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '::127.0.0.1', '64:ff9b::a00:1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'fec0::1', 'ff02::1', '2001:db8::1', '2001::1', '2002:7f00:1::1', '3fff::1', '[::1]', 'localhost', '1.2.3', '']
  const allowed = ['8.8.8.8', '1.1.1.1', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '192.169.0.1', '2606:4700::6810:1', '2001:4860:4860::8888', '2a00:1450:4001::200e']
  for (const address of blocked) assert.equal(blockedAddress(address), true, address)
  for (const address of allowed) assert.equal(blockedAddress(address), false, address)
  for (const url of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest/meta-data/', 'http://0/', 'http://[::]/', 'http://10.1.2.3:8080/', 'http://[fd00::1]/']) {
    assert.equal(targetProblem(new URL(url))?.code, 'blocked_address', url)
  }
  for (const url of ['http://x.com:25/', 'http://x.com:22/', 'https://x.com:0/', 'http://8.8.8.8:6667/']) assert.equal(targetProblem(new URL(url))?.code, 'blocked_port', url)
  for (const url of ['https://x.com/', 'http://x.com:8080/', 'http://8.8.8.8/', 'http://[2606:4700::6810:1]:3000/']) assert.equal(targetProblem(new URL(url)), undefined, url)
  assert.equal(targetProblem(new URL('http://127.0.0.1:4000/'), (address, port) => port === 4000), undefined)
  assert.equal(targetProblem(new URL('http://127.0.0.1:4001/'), (address, port) => port === 4000)?.code, 'blocked_address')
})

test('the test route reports a JSON answer with status, time, content type and the request it sent', async () => {
  const api = await serve({
    '/clientes': (req, res) => json(res, 200, { nome: 'Ana', plano: { id: 7 } }),
    '/texto': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('tudo certo')
    },
    '/gzip': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' })
      res.end(zlib.gzipSync(JSON.stringify({ compactado: true })))
    },
    '/latin1': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=iso-8859-1' })
      res.end(Buffer.from('ação', 'latin1'))
    },
    '/vazio': (req, res) => {
      res.writeHead(204)
      res.end()
    },
  })
  const handler = createTestApiHandler({ allowPrivate: only(api.port) })
  const answer = await call(handler, { url: api.url('/clientes?cpf=1'), method: 'POST', headers: [['Authorization', 'Bearer abc'], ['X-Lista', 'a'], ['x-lista', 'b']], body: '{"cpf":"1"}' })
  assert.equal(answer.status, 200)
  assert.equal(answer.headers.get('cache-control'), 'no-store')
  assert.equal(typeof answer.body.timeMs, 'number')
  assert.deepEqual({ ...answer.body, timeMs: 0 }, { ok: true, status: 200, statusText: 'OK', timeMs: 0, contentType: 'application/json; charset=utf-8', truncated: false, redirects: 0, json: { nome: 'Ana', plano: { id: 7 } } })
  const sent = api.requests.at(-1)
  assert.deepEqual([sent.method, sent.url, sent.body], ['POST', '/clientes?cpf=1', '{"cpf":"1"}'])
  assert.equal(sent.headers.authorization, 'Bearer abc')
  assert.equal(sent.headers['x-lista'], 'a, b')
  assert.equal(sent.headers['content-type'], 'application/json')
  assert.equal(sent.headers['content-length'], '11')
  assert.equal(sent.headers['user-agent'], 'flow-api-test/1.0')
  assert.equal(sent.headers.accept, 'application/json, text/plain, */*')
  assert.equal(sent.headers.host, `127.0.0.1:${api.port}`)
  assert.equal(classifyResponse(answer.body).valid, true)

  await call(handler, { url: api.url('/clientes'), method: 'PUT', headers: [['Content-Type', 'application/x-www-form-urlencoded'], ['User-Agent', 'meu-app']], body: 'a=1' })
  assert.deepEqual([api.requests.at(-1).method, api.requests.at(-1).headers['content-type'], api.requests.at(-1).headers['user-agent'], api.requests.at(-1).body], ['PUT', 'application/x-www-form-urlencoded', 'meu-app', 'a=1'])
  await call(handler, { url: api.url('/clientes'), method: 'PATCH', body: 'texto livre' })
  assert.equal(api.requests.at(-1).headers['content-type'], 'text/plain; charset=utf-8')
  await call(handler, { url: api.url('/clientes'), method: 'DELETE' })
  assert.deepEqual([api.requests.at(-1).method, api.requests.at(-1).body, api.requests.at(-1).headers['content-type']], ['DELETE', '', undefined])

  const text = await call(handler, { url: api.url('/texto'), method: 'GET' })
  assert.deepEqual([text.body.ok, text.body.contentType, text.body.text, text.body.json], [true, 'text/plain; charset=utf-8', 'tudo certo', undefined])
  assert.deepEqual((await call(handler, { url: api.url('/gzip'), method: 'GET', headers: [['Accept-Encoding', 'gzip']] })).body.json, { compactado: true })
  assert.equal((await call(handler, { url: api.url('/latin1'), method: 'GET' })).body.text, 'ação')
  const empty = await call(handler, { url: api.url('/vazio'), method: 'GET' })
  assert.deepEqual([empty.body.ok, empty.body.status, empty.body.text, empty.body.json], [true, 204, undefined, undefined])
})

test('404, 500 and answers that are not JSON come back with their status and a short excerpt', async () => {
  const api = await serve({
    '/ausente': (req, res) => json(res, 404, { erro: 'Cliente não encontrado' }),
    '/quebrou': (req, res) => {
      res.writeHead(500, 'Internal Server Error', { 'content-type': 'text/html' })
      res.end(`<html><body>${'falhou '.repeat(1000)}</body></html>`)
    },
    '/falso-json': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{nao é json')
    },
    '/grande': (req, res) => json(res, 200, { itens: Array.from({ length: 100 }, (_, index) => ({ id: index, texto: 'x'.repeat(500), fundo: { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } } })) }),
  })
  const handler = createTestApiHandler({ allowPrivate: only(api.port) })
  const missing = (await call(handler, { url: api.url('/ausente'), method: 'GET' })).body
  assert.deepEqual([missing.ok, missing.status, missing.statusText, missing.json], [false, 404, 'Not Found', { erro: 'Cliente não encontrado' }])
  assert.equal(classifyResponse(missing).message, 'A API respondeu com status 404 Not Found. Confira a URL.')
  const broken = (await call(handler, { url: api.url('/quebrou'), method: 'GET' })).body
  assert.deepEqual([broken.ok, broken.status, broken.contentType, broken.text.length, broken.truncated], [false, 500, 'text/html', 2000, false])
  assert.ok(broken.text.startsWith('<html><body>falhou'))
  assert.equal(classifyResponse(broken).message, 'A API respondeu com status 500 Internal Server Error. O servidor da API falhou ao responder.')
  const fake = (await call(handler, { url: api.url('/falso-json'), method: 'GET' })).body
  assert.deepEqual([fake.ok, fake.text, fake.json], [true, '{nao é json', undefined])
  const large = (await call(handler, { url: api.url('/grande'), method: 'GET' })).body
  assert.equal(large.truncated, false)
  assert.equal(large.json.itens.length, 20)
  assert.equal(large.json.itens[0].texto.length, 301)
  assert.deepEqual(large.json.itens[0].fundo.a.b.c.d.e, {})
  assert.ok(JSON.stringify(large).length < 64 * 1024)
})

test('a slow API runs out of time and a large answer is cut at 256 KB', async () => {
  const api = await serve({
    '/lenta': () => undefined,
    '/meia': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{"parcial": ')
    },
    '/enorme': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ dados: 'x'.repeat(300 * 1024) }))
    },
    '/bomba': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' })
      res.end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 97)))
    },
  })
  const handler = createTestApiHandler({ allowPrivate: only(api.port), timeoutMs: 300 })
  const started = Date.now()
  const slow = (await call(handler, { url: api.url('/lenta'), method: 'GET' })).body
  assert.equal(slow.error.code, 'timeout')
  assert.equal(slow.error.message, 'Tempo esgotado. A API não respondeu em 10 segundos.')
  assert.ok(slow.timeMs >= 250 && Date.now() - started < 5000, String(slow.timeMs))
  assert.equal((await call(handler, { url: api.url('/meia'), method: 'GET' })).body.error.code, 'timeout')
  const huge = (await call(handler, { url: api.url('/enorme'), method: 'GET' })).body
  assert.deepEqual([huge.ok, huge.status, huge.truncated, huge.json, huge.text.length], [true, 200, true, undefined, 2000])
  assert.equal(classifyResponse(huge).message, 'Resposta grande demais. A API devolveu mais de 256 KB.')
  const bomb = (await call(handler, { url: api.url('/bomba'), method: 'GET', headers: [['Accept-Encoding', 'gzip']] })).body
  assert.deepEqual([bomb.truncated, bomb.text.length], [true, 2000])
})

test('redirects are followed up to three times and each target is checked again', async () => {
  const other = await serve({ '*': (req, res) => json(res, 200, { outro: true }) })
  const api = await serve({
    '/r1': (req, res) => res.writeHead(302, { location: '/r2' }).end(),
    '/r2': (req, res) => res.writeHead(301, { location: '/r3' }).end(),
    '/r3': (req, res) => res.writeHead(307, { location: '/fim' }).end(),
    '/fim': (req, res) => json(res, 200, { chegou: true }),
    '/ciclo': (req, res) => res.writeHead(302, { location: '/ciclo' }).end(),
    '/interno': (req, res) => res.writeHead(302, { location: other.url('/segredo') }).end(),
    '/metadados': (req, res) => res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end(),
    '/mapeado': (req, res) => res.writeHead(308, { location: `http://[::ffff:127.0.0.1]:${other.port}/` }).end(),
    '/porta': (req, res) => res.writeHead(302, { location: 'http://example.com:25/' }).end(),
    '/estranho': (req, res) => res.writeHead(302, { location: 'ftp://example.com/' }).end(),
    '/sem-destino': (req, res) => res.writeHead(302).end(),
    '/303': (req, res) => res.writeHead(303, { location: '/eco' }).end(),
    '/308': (req, res) => res.writeHead(308, { location: '/eco' }).end(),
    '/fora': (req, res) => res.writeHead(307, { location: other.url('/eco') }).end(),
    '/eco': (req, res) => json(res, 200, { ok: true }),
  })
  const handler = createTestApiHandler({ allowPrivate: only(api.port) })
  const followed = (await call(handler, { url: api.url('/r1'), method: 'GET' })).body
  assert.deepEqual([followed.ok, followed.redirects, followed.json], [true, 3, { chegou: true }])
  const loop = (await call(handler, { url: api.url('/ciclo'), method: 'GET' })).body
  assert.deepEqual([loop.error.code, loop.redirects], ['too_many_redirects', 3])
  assert.equal(api.requests.filter((entry) => entry.url === '/ciclo').length, 4)
  for (const route of ['/interno', '/metadados', '/mapeado']) assert.equal((await call(handler, { url: api.url(route), method: 'GET' })).body.error.code, 'blocked_address', route)
  assert.equal(other.requests.length, 0)
  assert.equal((await call(handler, { url: api.url('/porta'), method: 'GET' })).body.error.code, 'blocked_port')
  assert.equal((await call(handler, { url: api.url('/estranho'), method: 'GET' })).body.error.code, 'invalid_redirect')
  const nowhere = (await call(handler, { url: api.url('/sem-destino'), method: 'GET' })).body
  assert.deepEqual([nowhere.ok, nowhere.status], [false, 302])

  await call(handler, { url: api.url('/303'), method: 'POST', body: '{"a":1}' })
  assert.deepEqual([api.requests.at(-1).method, api.requests.at(-1).body, api.requests.at(-1).headers['content-type']], ['GET', '', undefined])
  await call(handler, { url: api.url('/308'), method: 'POST', body: '{"a":1}' })
  assert.deepEqual([api.requests.at(-1).method, api.requests.at(-1).body], ['POST', '{"a":1}'])

  const both = createTestApiHandler({ allowPrivate: (address, port) => port === api.port || port === other.port })
  const crossed = (await call(both, { url: api.url('/fora'), method: 'POST', headers: [['Authorization', 'Bearer segredo'], ['Cookie', 'sessao=1'], ['X-Livre', 'sim']], body: '{"a":1}' })).body
  assert.deepEqual([crossed.ok, crossed.json], [true, { outro: true }])
  const received = other.requests.at(-1)
  assert.deepEqual([received.method, received.body, received.headers.authorization, received.headers.cookie, received.headers['x-livre']], ['POST', '{"a":1}', undefined, undefined, 'sim'])
})

test('invalid input, other sites and too many requests are refused', async () => {
  let clock = 1_000_000
  const handler = createTestApiHandler({ rateLimit: { limit: 2, windowMs: 60_000 }, now: () => clock })
  const refused = async (headers, code, status) => {
    const answer = await call(handler, { url: API, method: 'GET' }, headers)
    assert.deepEqual([answer.status, answer.body.ok, answer.body.error.code], [status, false, code], JSON.stringify(headers))
    return answer
  }
  await refused({ origin: 'https://evil.example' }, 'forbidden_origin', 403)
  await refused({ origin: 'null' }, 'forbidden_origin', 403)
  await refused({ origin: 'http://localhost:3001' }, 'forbidden_origin', 403)
  await refused({ origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, 'forbidden_origin', 403)
  await refused({ origin: ORIGIN, 'sec-fetch-site': 'same-site' }, 'forbidden_origin', 403)
  await refused({ origin: undefined }, 'forbidden_origin', 403)
  await refused({ origin: undefined, 'sec-fetch-site': 'none' }, 'forbidden_origin', 403)

  const open = createTestApiHandler({ rateLimit: { limit: 100, windowMs: 60_000 } })
  const invalid = async (input, code, status = 400, headers = {}) => {
    const answer = await call(open, input, headers)
    assert.deepEqual([answer.status, answer.body.error.code], [status, code], JSON.stringify(input).slice(0, 80))
  }
  await invalid({ url: API, method: 'GET' }, 'unsupported_media', 415, { 'content-type': 'text/plain' })
  await invalid('{nao é json', 'invalid_request')
  await invalid('[]', 'invalid_request')
  await invalid({ url: 'ftp://x.com', method: 'GET' }, 'invalid_url')
  await invalid({ url: API, method: 'TRACE' }, 'invalid_method')
  await invalid({ url: API, method: 'GET', headers: [['Host', 'interno']] }, 'forbidden_header')
  await invalid({ url: API, method: 'POST', body: 'x'.repeat(100 * 1024 + 1) }, 'body_too_large')
  await invalid({ url: API, method: 'POST', body: 'x'.repeat(600 * 1024) }, 'payload_too_large', 413)
  const same = await call(open, { url: 'http://127.0.0.1:9/', method: 'GET' }, { origin: undefined, 'sec-fetch-site': 'same-origin' })
  assert.equal(same.body.error.code, 'blocked_port')
  const forwarded = await call(open, { url: 'http://10.0.0.1/', method: 'GET' }, { origin: 'https://flow.lucas-lima.xyz', 'x-forwarded-host': 'flow.lucas-lima.xyz' })
  assert.deepEqual([forwarded.status, forwarded.body.error.code], [200, 'blocked_address'])

  const first = await call(handler, '{}', { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })
  const second = await call(handler, '{}', { 'x-forwarded-for': '203.0.113.5' })
  assert.deepEqual([first.status, second.status], [400, 400])
  const limited = await refused({ 'x-forwarded-for': '203.0.113.5' }, 'rate_limited', 429)
  assert.equal(limited.headers.get('retry-after'), '60')
  assert.equal(limited.body.error.message, 'Muitos testes em pouco tempo. Aguarde um minuto e teste de novo.')
  assert.equal((await call(handler, '{}', { 'x-forwarded-for': '198.51.100.20' })).status, 400)
  clock += 30_000
  assert.equal((await refused({ 'x-forwarded-for': '203.0.113.5' }, 'rate_limited', 429)).headers.get('retry-after'), '30')
  clock += 30_000
  assert.equal((await call(handler, '{}', { 'x-forwarded-for': '203.0.113.5' })).status, 400)
})

test('the strict route refuses loopback, private, link-local and mapped addresses before connecting', async () => {
  const api = await serve({ '*': (req, res) => json(res, 200, { alcançado: true }) })
  assert.equal(route.runtime, 'nodejs')
  assert.equal(typeof route.POST, 'function')
  const strict = createTestApiHandler()
  const urls = [
    api.url('/'), `http://localhost:${api.port}/`, `http://2130706433:${api.port}/`, `http://0x7f000001:${api.port}/`, `http://0177.0.0.1:${api.port}/`, `http://127.1:${api.port}/`,
    `http://[::1]:${api.port}/`, `http://[::ffff:127.0.0.1]:${api.port}/`, `http://[::ffff:7f00:1]:${api.port}/`, `http://0.0.0.0:${api.port}/`, `http://[::]:${api.port}/`,
    'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://172.16.5.4/', 'http://192.168.0.1/', 'http://100.64.0.1/', 'http://224.0.0.1/', 'http://[fd00::1]/', 'http://[fe80::1]/',
  ]
  for (const url of urls) {
    for (const handler of [strict, route.POST]) {
      const answer = await call(handler, { url, method: 'GET' })
      assert.deepEqual([answer.status, answer.body.ok, answer.body.error.code, answer.body.error.message], [200, false, 'blocked_address', TEST_ERROR_MESSAGES.blocked_address], url)
    }
  }
  assert.equal(api.requests.length, 0)

  const resolved = []
  const rebinding = createTestApiHandler({ resolve: async (hostname) => {
    resolved.push(hostname)
    return [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]
  } })
  assert.equal((await call(rebinding, { url: `http://api.lucas-lima.xyz:${api.port}/`, method: 'GET' })).body.error.code, 'blocked_address')
  assert.deepEqual(resolved, ['api.lucas-lima.xyz'])
  const pinned = createTestApiHandler({ allowPrivate: only(api.port), resolve: async () => [{ address: '127.0.0.1', family: 4 }] })
  const reached = (await call(pinned, { url: `http://api.lucas-lima.xyz:${api.port}/rota`, method: 'GET' })).body
  assert.deepEqual([reached.ok, reached.json], [true, { alcançado: true }])
  assert.equal(api.requests.at(-1).headers.host, `api.lucas-lima.xyz:${api.port}`)
  let checks = 0
  const sent = api.requests.length
  const swapped = createTestApiHandler({ allowPrivate: () => ++checks === 1, resolve: async () => [{ address: '127.0.0.1', family: 4 }] })
  assert.equal((await call(swapped, { url: `http://api.lucas-lima.xyz:${api.port}/`, method: 'GET' })).body.error.code, 'blocked_address')
  assert.equal(checks, 2)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(api.requests.length, sent)
  const nowhere = createTestApiHandler({ resolve: async () => [] })
  assert.equal((await call(nowhere, { url: 'http://nada.lucas-lima.xyz/', method: 'GET' })).body.error.code, 'dns')
  const unknown = createTestApiHandler({ resolve: async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) } })
  assert.equal((await call(unknown, { url: 'http://nada.lucas-lima.xyz/', method: 'GET' })).body.error.code, 'dns')

  const closed = await serve({})
  await closed.close()
  const refused = (await call(createTestApiHandler({ allowPrivate: only(closed.port) }), { url: closed.url('/'), method: 'GET' })).body
  assert.equal(refused.error.code, 'refused')
  assert.equal(refused.error.message, 'Conexão recusada. O servidor da API não aceitou a conexão.')
})
