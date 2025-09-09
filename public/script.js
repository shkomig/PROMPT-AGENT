// Client script: loads derived rules and calls /api/build to construct a professional prompt
// Expects Hebrew input. UI is RTL.

async function loadRules() {
  const el = document.getElementById('rules')
  el.textContent = 'Loading...'
  try {
    const res = await fetch('/api/rules')
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to load rules')
    // render structured view
    function renderRules(filterRelevant) {
      const container = document.createElement('div')
      const guidesLine = document.createElement('div')
      guidesLine.textContent = 'Guides found: ' + (data.guides || []).join(', ')
      container.appendChild(guidesLine)

      const hintsTitle = document.createElement('h4')
      hintsTitle.textContent = 'Task hints'
      container.appendChild(hintsTitle)
      const ul = document.createElement('ul')
      for (const [k, v] of Object.entries(data.rules.taskHints || {})) {
        if (filterRelevant && (!v || v.length === 0)) continue
        const li = document.createElement('li')
        li.textContent = `${k}: ${v.join(', ')}`
        ul.appendChild(li)
      }
      container.appendChild(ul)

      const exTitle = document.createElement('h4')
      exTitle.textContent = 'Examples'
      container.appendChild(exTitle)
      for (const ex of data.rules.examples || []) {
        const p = document.createElement('p')
        p.textContent = `• ${ex.filename}: ${ex.snippet.slice(0, 120).replace(/\n/g, ' ')}...`
        container.appendChild(p)
      }
      return container
    }

    const filterEl = document.getElementById('filterRelevant')
    el.innerHTML = ''
    el.appendChild(renderRules(filterEl.checked))
    filterEl.addEventListener('change', () => {
      el.innerHTML = ''
      el.appendChild(renderRules(filterEl.checked))
    })
  } catch (err) {
    el.textContent = 'Error loading rules: ' + err.message
  }
}

async function buildPrompt() {
  const text = document.getElementById('userText').value.trim()
  const model = document.getElementById('modelSelect').value
  const outLang = document.getElementById('langSelect').value
  const temperature = parseFloat(document.getElementById('temp').value)
  const top_p = parseFloat(document.getElementById('top_p').value)
  const resultEl = document.getElementById('result')
  const modelEl = document.getElementById('model')
  if (!text) {
    resultEl.textContent = 'Please enter Hebrew text first.'
    return
  }

  resultEl.textContent = 'Generating...'
  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model, outLang, temperature, top_p }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to build prompt')

    resultEl.textContent = data.professionalPrompt
    // show detailed professional prompt
    resultEl.textContent = data.professionalPrompt
    // show final paste-ready prompt
    const finalEl = document.getElementById('final')
    finalEl.textContent = data.finalPrompt || ''

    // show which retrieved contexts were used (if any)
    const rulesPanel = document.getElementById('rules')
    if (data.retrieved && data.retrieved.length) {
      const list = document.createElement('ul')
      for (const r of data.retrieved) {
        const li = document.createElement('li')
        li.textContent = `${r.filename} (score=${r.score.toFixed(3)})`
        list.appendChild(li)
      }
      rulesPanel.innerHTML = ''
      rulesPanel.appendChild(document.createTextNode('Retrieved contexts:'))
      rulesPanel.appendChild(list)
    }

    modelEl.textContent =
      'Model recommendation: ' +
      data.modelRecommendation +
      ' | params: temperature=' +
      data.params.temperature +
      ', top_p=' +
      data.params.top_p
  } catch (err) {
    resultEl.textContent = 'Error: ' + err.message
    modelEl.textContent = ''
  }
}

document.getElementById('generate').addEventListener('click', buildPrompt)
document.getElementById('reloadRules').addEventListener('click', loadRules)
document.getElementById('copyFinal').addEventListener('click', () => {
  const final = document.getElementById('final').textContent
  if (!final) return
  try {
    navigator.clipboard.writeText(final)
    alert('Final prompt copied to clipboard')
  } catch (e) {
    alert('Copy failed: ' + e.message)
  }
})

// Load on startup
loadRules()
