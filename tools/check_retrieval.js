const http = require('http')

function getRules(callback) {
  http
    .get('http://localhost:3000/api/rules', (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => callback(null, JSON.parse(body)))
    })
    .on('error', (e) => callback(e))
}

function postBuild(text, callback) {
  const data = JSON.stringify({ text })
  const opts = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/build',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data, 'utf8'),
    },
  }
  const req = http.request(opts, (res) => {
    let body = ''
    res.setEncoding('utf8')
    res.on('data', (c) => (body += c))
    res.on('end', () => callback(null, JSON.parse(body)))
  })
  req.on('error', (e) => callback(e))
  req.write(data)
  req.end()
}

getRules((err, rules) => {
  if (err) return console.error('rules error', err.message)
  console.log('rules indexSize', rules.indexSize)
  const tests = [
    'צור לי משחק טטריס',
    'סכם לי את המסמך לגבי אבטחה',
    'תרגם את הטקסט הזה לאנגלית',
  ]
  ;(async () => {
    for (const t of tests) {
      await new Promise((res) => {
        postBuild(t, (e, out) => {
          if (e) console.error('post error', e.message)
          else
            console.log('test:', t, 'retrieved:', (out.retrieved || []).length)
          res()
        })
      })
    }
  })()
})
