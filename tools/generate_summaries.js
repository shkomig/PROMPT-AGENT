const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const natural = require('natural')

const DATA_DIR = path.join(__dirname, '..', 'data')
const OUT = path.join(DATA_DIR, 'summaries.json')

const tokenizer = new natural.WordTokenizer()

const KEYWORDS = [
  'tetris',
  'game',
  'canvas',
  'react',
  'javascript',
  'performance',
  'canvas',
  'input',
  'keyboard',
  'touch',
  'ocr',
  'pdf',
  'security',
  'deploy',
  'i18n',
  'rtl',
  'accessibility',
  'webaudio',
  'audio',
  'collision',
  'physics',
  'state',
  'hooks',
  'component',
  'api',
  'fetch',
  'token',
]

async function extractText(abs, ext) {
  try {
    if (ext === '.pdf') {
      const data = await fs.promises.readFile(abs)
      const res = await pdf(data)
      return res.text
    } else if (ext === '.docx') {
      const data = await fs.promises.readFile(abs)
      const res = await mammoth.extractRawText({ buffer: data })
      return res.value
    } else {
      return await fs.promises.readFile(abs, 'utf8')
    }
  } catch (e) {
    console.error('failed parse', abs, e.message)
    return ''
  }
}

function summarizeText(text, maxLen = 400) {
  if (!text) return ''
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLen) return cleaned
  // try to cut at sentence boundary
  const idx = cleaned.lastIndexOf('.', maxLen)
  if (idx > 50) return cleaned.slice(0, idx + 1)
  return cleaned.slice(0, maxLen) + '...'
}

function extractTags(text) {
  const t = (text || '').toLowerCase()
  const tags = new Set()
  for (const k of KEYWORDS) {
    if (t.indexOf(k) !== -1) tags.add(k)
  }
  return Array.from(tags)
}

async function run() {
  const files = await fs.promises.readdir(DATA_DIR).catch(() => [])
  const out = []
  for (const f of files) {
    const abs = path.join(DATA_DIR, f)
    const stat = await fs.promises.stat(abs).catch(() => null)
    if (!stat || stat.isDirectory()) continue
    const ext = path.extname(f).toLowerCase()
    const text = await extractText(abs, ext)
    const summary = summarizeText(text, 600)
    const tags = extractTags(text)
    out.push({ filename: f, summary, tags, length: (text || '').length })
  }
  await fs.promises.writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
  console.log('wrote', OUT, 'entries=', out.length)
}

run().catch((e) => {
  console.error('generate_summaries failed', e)
  process.exit(1)
})
