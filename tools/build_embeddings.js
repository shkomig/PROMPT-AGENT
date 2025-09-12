/*
 Simple script to build embeddings.json for local retrieval.
 Usage: OPENAI_API_KEY=... node tools/build_embeddings.js
 Produces: data/embeddings.json
*/
const fs = require('fs')
const path = require('path')
// prefer global fetch (Node 18+); fallback to node-fetch if not available
let fetchFn = null
if (typeof globalThis.fetch === 'function') fetchFn = globalThis.fetch
else {
  try {
    fetchFn = require('node-fetch')
  } catch (e) {
    // fetch will remain null and script will error gracefully
    fetchFn = null
  }
}

const DATA_DIR = path.join(__dirname, '..', 'data')

async function readGuides() {
  const files = await fs.promises.readdir(DATA_DIR).catch(() => [])
  const guides = []
  for (const f of files) {
    const abs = path.join(DATA_DIR, f)
    const stat = await fs.promises.stat(abs).catch(() => null)
    if (!stat || stat.isDirectory()) continue
    const ext = path.extname(f).toLowerCase()
    try {
      const text = await fs.promises.readFile(abs, 'utf8')
      guides.push({ filename: f, text })
    } catch (e) {
      // skip binary like pdf/docx
    }
  }
  return guides
}

function chunkText(text, maxWords = 60) {
  const words = text.split(/\s+/)
  const chunks = []
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words
      .slice(i, i + maxWords)
      .join(' ')
      .trim()
    if (slice.length > 20) chunks.push(slice)
  }
  return chunks
}

async function main() {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.error(
      'Please set OPENAI_API_KEY environment variable (export OPENAI_API_KEY=...)'
    )
    process.exit(1)
  }

  const guides = await readGuides()
  const items = []
  for (const g of guides) {
    const chunks = chunkText(g.text || '')
    for (const c of chunks) items.push({ filename: g.filename, text: c })
  }

  console.log('Preparing to embed items=', items.length)
  const out = []
  const batchSize = 16
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const inputs = batch.map((b) => b.text)
    if (!fetchFn) {
      console.error(
        'No fetch implementation available. Install node-fetch or run on Node >=18'
      )
      process.exit(1)
    }
    const resp = await fetchFn('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: inputs }),
    })
    if (!resp.ok) {
      console.error('OpenAI embeddings error', resp.status, await resp.text())
      process.exit(1)
    }
    const j = await resp.json()
    for (let k = 0; k < batch.length; k++) {
      const e = (j.data && j.data[k] && j.data[k].embedding) || null
      if (e)
        out.push({
          filename: batch[k].filename,
          text: batch[k].text,
          embedding: e,
        })
    }
    console.log('embedded batch', i, out.length)
    await new Promise((r) => setTimeout(r, 200))
  }

  const outPath = path.join(DATA_DIR, 'embeddings.json')
  await fs.promises.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log('wrote', outPath, 'entries=', out.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
