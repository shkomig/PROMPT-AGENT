/*
Build a local TF-IDF vector index and write to data/local_vectors.json
Usage: node tools/build_local_vectors.js
Produces: data/local_vectors.json
*/
const fs = require('fs')
const path = require('path')
const natural = require('natural')

const DATA_DIR = path.join(__dirname, '..', 'data')

// Hebrew normalization and simple stemming to improve recall
function normalizeHebrew(text) {
  if (!text) return ''
  let t = text.toString().toLowerCase()
  // remove Hebrew diacritics (niqqud)
  t = t.replace(/[\u0591-\u05C7]/g, '')
  // normalize final forms to standard letters (ך->כ, ם->מ, ן->נ, ף->פ, ץ->צ)
  t = t
    .replace(/[ך]/g, 'כ')
    .replace(/[ם]/g, 'מ')
    .replace(/[ן]/g, 'נ')
    .replace(/[ף]/g, 'פ')
    .replace(/[ץ]/g, 'צ')
  // replace non-letter/number (except Hebrew/Latin/zwj/zwj) with space
  t = t.replace(/[^a-z0-9\u0590-\u05FF\u200c\u200d]+/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function stemHebrewToken(tok) {
  // aggressive but safe suffix stripping for Hebrew
  const suffixes = [
    'ויות',
    'יות',
    'ות',
    'יות',
    'ויות',
    'יים',
    'ים',
    'ותיו',
    'ויותיו',
    'יותיו',
    'ה',
    'הם',
    'יה',
    'יו',
    'יהן',
    'יהם',
    'נו',
    'כם',
    'כן',
    'יה',
    'י',
    'ו',
    'ת',
  ]
  for (const sfx of suffixes) {
    if (tok.length > sfx.length + 2 && tok.endsWith(sfx)) {
      tok = tok.slice(0, -sfx.length)
      break
    }
  }
  // strip common prefixes (ה', ב', ל', כ', מ')
  const prefixes = ['ה', 'ב', 'ל', 'מ', 'כ', 'ש']
  for (const pfx of prefixes) {
    if (tok.length > pfx.length + 2 && tok.startsWith(pfx)) {
      tok = tok.slice(pfx.length)
      break
    }
  }
  return tok
}

function tokenizeNormalized(text) {
  const norm = normalizeHebrew(text)
  if (!norm) return []
  return norm.split(' ').map(stemHebrewToken).filter(Boolean)
}

const pdf = require('pdf-parse')
const mammoth = require('mammoth')

async function readTextFiles() {
  const files = await fs.promises.readdir(DATA_DIR).catch(() => [])
  const results = []
  for (const f of files) {
    const abs = path.join(DATA_DIR, f)
    const stat = await fs.promises.stat(abs).catch(() => null)
    if (!stat || stat.isDirectory()) continue
    const ext = path.extname(f).toLowerCase()
    try {
      if (ext === '.pdf') {
        const buf = await fs.promises.readFile(abs)
        const r = await pdf(buf)
        results.push({ filename: f, text: r.text })
        continue
      }
      if (ext === '.docx') {
        const buf = await fs.promises.readFile(abs)
        const r = await mammoth.extractRawText({ buffer: buf })
        results.push({ filename: f, text: r.value })
        continue
      }
      const text = await fs.promises.readFile(abs, 'utf8')
      results.push({ filename: f, text })
    } catch (e) {
      // skip unreadable
    }
  }
  return results
}

function chunkText(text, maxWords = 60) {
  const words = text.split(/\s+/)
  const out = []
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words
      .slice(i, i + maxWords)
      .join(' ')
      .trim()
    if (slice.length > 20) out.push(slice)
  }
  return out
}

async function main() {
  const guides = await readTextFiles()
  const docs = []
  for (const g of guides) {
    const chunks = chunkText(g.text || '')
    for (const c of chunks) docs.push({ filename: g.filename, text: c })
  }
  // build vocab
  const vocab = {}
  const tokenized = []
  for (const d of docs) {
    const toks = tokenizeNormalized(d.text)
    tokenized.push(toks)
    for (const t of toks) vocab[t] = (vocab[t] || 0) + 1
  }
  // limit vocabulary to most frequent terms to keep vectors manageable
  // sort vocab by term frequency desc and pick top N
  const VocabLimit = 5000
  const vocabList = Object.entries(vocab)
    .sort((a, b) => b[1] - a[1])
    .slice(0, VocabLimit)
    .map((x) => x[0])
  const idf = {}
  for (const w of vocabList) {
    let df = 0
    for (const toks of tokenized) if (toks.includes(w)) df++
    idf[w] = Math.log((1 + docs.length) / (1 + df))
  }
  const vectors = []
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const toks = tokenized[i]
    // build sparse vector: only include non-zero entries to reduce JSON size
    const sparse = []
    for (let j = 0; j < vocabList.length; j++) {
      const w = vocabList[j]
      const tf = toks.filter((x) => x === w).length
      const val = tf * (idf[w] || 0)
      if (val !== 0) sparse.push([j, val])
    }
    // keep a short preview of the text to help debugging
    const preview = (doc.text || '').slice(0, 400)
    vectors.push({ filename: doc.filename, text: preview, vec: sparse })
  }
  const out = { vocab: vocabList, vectors }
  await fs.promises.writeFile(
    path.join(DATA_DIR, 'local_vectors.json'),
    JSON.stringify(out, null, 2),
    'utf8'
  )
  console.log('wrote data/local_vectors.json entries=', vectors.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
