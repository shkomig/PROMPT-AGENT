const http = require('http')
const data = JSON.stringify({ text: 'צור לי משחק טטריס' })

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
    console.log('STATUS', res.statusCode)
    console.log('HEADERS', res.headers)
    console.log('BODY', body)
  })
})

req.on('error', (e) => console.error('problem with request:', e.message))
req.write(data, 'utf8')
req.end()
