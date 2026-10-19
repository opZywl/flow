const BASE = (process.env.DEPLOY_URL || 'https://flow-yzy.vercel.app').replace(/\/$/, '')
const CHUNK = /static\/chunks\/[A-Za-z0-9_\-\/\.\[\]%]+?\.js/g

const args = process.argv.slice(2)
const waitAt = args.indexOf('--wait')
const waitSeconds = waitAt < 0 ? 0 : Number(args[waitAt + 1] || 300)
const skipped = waitAt < 0 ? [] : [waitAt, waitAt + 1]
const markers = args.filter((_, index) => !skipped.includes(index))
if (!markers.length || !Number.isFinite(waitSeconds)) {
  process.stderr.write('Uso: npm run check:deploy -- [--wait segundos] "texto 1" "texto 2"\n')
  process.exit(1)
}

const escapeChar = (char) => {
  const code = char.codePointAt(0)
  return code < 0x100 ? [`\\x${code.toString(16).padStart(2, '0')}`, `\\u${code.toString(16).padStart(4, '0')}`] : [`\\u${code.toString(16).padStart(4, '0')}`]
}
const variants = (marker) => {
  if (/^[\x00-\x7f]*$/.test(marker)) return [marker]
  const forms = [...marker].map((char) => (char.codePointAt(0) < 0x80 ? [char] : escapeChar(char)))
  return [marker, forms.map((form) => form[0]).join(''), forms.map((form) => form.at(-1)).join('')]
}

async function text(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

async function scan() {
  const seen = new Set()
  const queue = []
  const add = (found) => {
    const url = `${BASE}/_next/${found.replace(/\\/g, '').replace(/^.*?static\//, 'static/')}`
    if (seen.has(url)) return
    seen.add(url)
    queue.push(url)
  }
  const html = await text(`${BASE}/flow`)
  for (const match of html.matchAll(CHUNK)) add(match[0])
  const hits = new Map(markers.map((marker) => [marker, false]))
  const check = (body) => {
    for (const marker of markers) if (!hits.get(marker) && variants(marker).some((form) => body.includes(form))) hits.set(marker, true)
  }
  check(html)
  while (queue.length) {
    const url = queue.shift()
    let body
    try {
      body = await text(url)
    } catch {
      continue
    }
    check(body)
    for (const match of body.matchAll(CHUNK)) add(match[0])
    if (!/webpack-[a-f0-9]+\.js$/.test(url)) continue
    for (const map of body.matchAll(/\{((?:\d+:"[a-f0-9]+",?)+)\}/g)) {
      for (const pair of map[1].matchAll(/(\d+):"([a-f0-9]+)"/g)) add(`static/chunks/${pair[1]}.${pair[2]}.js`)
    }
  }
  return { files: seen.size, hits }
}

async function main() {
  const deadline = Date.now() + waitSeconds * 1000
  for (;;) {
    const { files, hits } = await scan()
    const missing = [...hits].filter(([, hit]) => !hit).map(([marker]) => marker)
    if (!missing.length || Date.now() >= deadline) {
      process.stdout.write(`${BASE}: ${files} arquivos lidos\n`)
      for (const [marker, hit] of hits) process.stdout.write(`${hit ? 'ok     ' : 'ausente'} ${marker}\n`)
      process.exit(missing.length ? 1 : 0)
    }
    await new Promise((resolve) => setTimeout(resolve, 20000))
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
