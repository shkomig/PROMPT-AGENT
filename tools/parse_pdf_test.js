const fs = require('fs')
const pdf = require('pdf-parse')
const file = 'data/6.pdf'

fs.readFile(file, (err, buf) => {
  if (err) return console.error('read error', err.message)
  pdf(buf)
    .then((r) => {
      console.log('parsed length', r.text?.length || 0)
    })
    .catch((e) => {
      console.error('parse error', e.message)
      console.error(e)
    })
})
