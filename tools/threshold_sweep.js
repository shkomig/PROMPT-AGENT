const http = require('http')

const QUERIES = [
  'צור לי משחק טטריס',
  'סכם לי את המסמך לגבי אבטחה',
  'תרגם את הטקסט הזה לאנגלית',
  'כתוב דוגמה של רכיב React לטופס כניסה',
  'הסבר איך למדוד ביצועים בדפדפן',
]

const THRESHOLDS = [0.0, 0.01, 0.02, 0.05, 0.08, 0.12, 0.2]

function postBuild(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text })
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/build',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data, 'utf8'),
      },
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve(json)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', (e) => reject(e))
    req.write(data, 'utf8')
    req.end()
  })
}

async function run() {
  console.log('Threshold sweep starting...')
  const results = {}
  for (const t of THRESHOLDS) {
    // temporarily set environment variable to instruct server to use a different threshold
    process.env.TEST_THRESHOLD = t
    const perQuery = []
    for (const q of QUERIES) {
      try {
        const res = await postBuild(q)
        const retrieved = res.retrieved || []
        perQuery.push(retrieved.length)
      } catch (e) {
        perQuery.push(null)
      }
    }
    results[t] = perQuery
  }

  console.log('\nSweep results (threshold => counts per query):')
  console.log('threshold\t' + QUERIES.map((q, i) => `Q${i + 1}`).join('\t'))
  for (const [t, arr] of Object.entries(results)) {
    console.log(`${t}\t${arr.map((v) => (v === null ? 'ERR' : v)).join('\t')}`)
  }

  // simple recommendation: pick highest threshold that still returns at least 1 snippet for majority
  const medianCounts = Object.entries(results).map(([t, arr]) => {
    const vals = arr.filter((v) => v !== null)
    const sum = vals.reduce((a, b) => a + b, 0)
    return { t: parseFloat(t), sum }
  })
  medianCounts.sort((a, b) => b.sum - a.sum)
  console.log(
    '\nRecommendation: thresholds sorted by total retrieved across queries:'
  )
  medianCounts.forEach((m) => console.log(`${m.t}: totalRetrieved=${m.sum}`))
}

run().catch((e) => console.error('Sweep failed', e))
