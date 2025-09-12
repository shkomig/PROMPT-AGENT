const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const SUM_PATH = path.join(DATA_DIR, 'summaries.json')

const RULES = [
  { tag: 'tetris', words: ['tetris', 'טטריס'] },
  { tag: 'game', words: ['game', 'משחק'] },
  { tag: 'react', words: ['react'] },
  { tag: 'canvas', words: ['canvas'] },
  { tag: 'tutorial', words: ['tutorial', 'מדריך', 'הדרכה'] },
  { tag: 'priority', words: ['priority', 'PRIORITY'] },
  { tag: 'input', words: ['input', 'keyboard', 'מקלדת', 'touch', 'קלט'] },
  { tag: 'performance', words: ['performance', 'fps', 'ביצועים'] },
  {
    tag: 'collision',
    words: ['collision', 'התנגשות', 'collision detection', 'תנגשויות'],
  },
]

async function run() {
  if (!fs.existsSync(SUM_PATH)) {
    console.error('summaries.json not found')
    process.exit(1)
  }
  const raw = await fs.promises.readFile(SUM_PATH, 'utf8')
  const sums = JSON.parse(raw)
  for (const s of sums) {
    const t = (s.summary || '').toLowerCase()
    const tags = new Set(s.tags || [])
    for (const r of RULES) {
      for (const w of r.words) if (t.indexOf(w) !== -1) tags.add(r.tag)
    }
    s.tags = Array.from(tags)
    // set priority flag if title or tags include PRIORITY
    if (
      s.tags.includes('priority') ||
      /priority/i.test(s.filename) ||
      (s.filename || '').toLowerCase().includes('priority')
    )
      s.priority = true
  }
  await fs.promises.writeFile(SUM_PATH, JSON.stringify(sums, null, 2), 'utf8')
  console.log('refined tags for', sums.length, 'entries')
}

run().catch((e) => {
  console.error('refine failed', e)
  process.exit(1)
})
