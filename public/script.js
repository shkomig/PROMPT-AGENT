// Client script: loads derived rules and calls /api/build to construct a professional prompt
// Expects Hebrew input. UI is RTL.

async function loadRules() {
  const el = document.getElementById('rules')
  el.textContent = 'Loading...'
  try {
    const res = await fetch('/api/rules')
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to load rules')

    const parts = []
    parts.push('Guides found: ' + (data.guides || []).join(', '))
    parts.push('\nTask hints:')
    for (const [k, v] of Object.entries(data.rules.taskHints || {})) {
      parts.push(`${k}: ${v.join(', ')}`)
    }
    parts.push('\nExamples:')
    for (const ex of data.rules.examples || []) {
      parts.push(
        `- ${ex.filename}: ${ex.snippet.slice(0, 120).replace(/\n/g, ' ')}...`
      )
    }
    el.textContent = parts.join('\n')
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
      const lines = data.retrieved.map(
        (r) => `${r.filename} (score=${r.score.toFixed(3)})`
      )
      rulesPanel.textContent = 'Retrieved contexts:\n' + lines.join('\n')
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

// Config management
async function loadConfig() {
  try {
    const res = await fetch('/api/config')
    const data = await res.json()
    if (data && data.ok && data.config) {
      document.getElementById('chunkSize').value = data.config.chunkMaxTokens
    }
  } catch (e) {
    console.warn('Failed to load config', e)
  }
}

async function saveConfig() {
  const v = parseInt(document.getElementById('chunkSize').value, 10)
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkMaxTokens: v }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to save config')
    alert('Config saved. Rebuilt index in background.')
  } catch (e) {
    alert('Save config failed: ' + e.message)
  }
}

document.getElementById('saveConfig').addEventListener('click', saveConfig)

// Templates editor
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates')
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to load templates')
    document.getElementById('templatesEditor').value = JSON.stringify(
      data.templates,
      null,
      2
    )
  } catch (e) {
    alert('Failed to load templates: ' + e.message)
  }
}

async function saveTemplates() {
  try {
    const txt = document.getElementById('templatesEditor').value
    const json = JSON.parse(txt)
    const res = await fetch('/api/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Failed to save templates')
    alert('Templates saved')
  } catch (e) {
    alert('Save templates failed: ' + e.message)
  }
}

document.getElementById('loadTemplates').addEventListener('click', loadTemplates)
document.getElementById('saveTemplates').addEventListener('click', saveTemplates)

// Load config and templates at startup
loadConfig()
loadTemplates()
