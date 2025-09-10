const express = require('express')
const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const natural = require('natural')

// tokenizer and TF-IDF index (in-memory)
const tokenizer = new natural.WordTokenizer()
let tfidf = null
let tfDocuments = []
let PRIORITY_BASES = new Set()

// simple debounce helper
function debounce(fn, wait) {
  let t = null
  return (...args) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

const DATA_DIR = path.join(__dirname, 'data')
// Config: threshold for considering a retrieved chunk as relevant (TF-IDF measure)
const CONTEXT_TFIDF_THRESHOLD = 0.08 // tuneable; TF-IDF measure scale is library-specific

const app = express()
// capture raw body for debugging JSON parse errors and set a reasonable size limit
app.use(
  express.json({
    limit: '2mb',
    verify: function (req, res, buf, encoding) {
      try {
        req.rawBody = buf.toString(encoding || 'utf8')
      } catch (e) {
        req.rawBody = undefined
      }
    },
  })
)
app.use(express.static(path.join(__dirname, 'public')))

// error handler for invalid JSON body (body-parser)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    // write raw request body to server.log for debugging
    try {
      const logLine = `[${new Date().toISOString()}] Invalid JSON body from ${
        req.ip
      } - rawBody=${JSON.stringify(req.rawBody)}\n`
      fs.appendFileSync(path.join(__dirname, 'server.log'), logLine)
    } catch (e) {
      // ignore logging errors
    }
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' })
  }
  next()
})

// Helper: read all files in DATA_DIR and extract text
async function readGuides() {
  const files = await fs.promises.readdir(DATA_DIR).catch(() => null)
  if (!files) throw new Error('DATA directory inaccessible')

  const guides = []
  for (const f of files) {
    const abs = path.join(DATA_DIR, f)
    const stat = await fs.promises.stat(abs)
    if (stat.isDirectory()) continue
    const ext = path.extname(f).toLowerCase()
    try {
      if (ext === '.pdf') {
        const data = await fs.promises.readFile(abs)
        const res = await pdf(data)
        guides.push({ filename: f, text: res.text })
      } else if (ext === '.docx') {
        const data = await fs.promises.readFile(abs)
        const res = await mammoth.extractRawText({ buffer: data })
        guides.push({ filename: f, text: res.value })
      } else {
        // plain text / md / other
        const text = await fs.promises.readFile(abs, 'utf8')
        guides.push({ filename: f, text })
      }
    } catch (err) {
      console.error('Failed to read', f, err.message)
    }
  }
  return guides
}

// Simple chunking: split by paragraphs and lines; keep small chunks
// Chunk by approximate token count (word tokens)
function chunkText(text, maxTokens = 60) {
  const words = tokenizer.tokenize(text)
  const chunks = []
  for (let i = 0; i < words.length; i += maxTokens) {
    const slice = words.slice(i, i + maxTokens).join(' ')
    if (slice.trim().length > 20) chunks.push(slice.trim())
  }
  return chunks
}

// Build in-memory TF-IDF index from guides
async function buildIndex() {
  const guides = await readGuides().catch(() => [])
  tfidf = new natural.TfIdf()
  tfDocuments = []
  PRIORITY_BASES = new Set()
  let id = 0
  const priorityNames = new Set(['12', '13', '14', '15'])
  for (const g of guides) {
    const base = path.basename(g.filename, path.extname(g.filename))
    if (priorityNames.has(base)) PRIORITY_BASES.add(base)
    const chunks = chunkText(g.text || '')
    for (const c of chunks) {
      tfDocuments.push({ id: id++, filename: g.filename, base, text: c })
      tfidf.addDocument(c)
    }
  }
}

// Watch data directory and rebuild index on changes (debounced)
try {
  const rebuild = debounce(() => {
    buildIndex().catch((e) => console.error('index build error', e.message))
  }, 500)
  fs.watch(DATA_DIR, { persistent: false }, (eventType, filename) => {
    if (filename) {
      console.log('data dir change detected:', eventType, filename)
      rebuild()
    }
  })
} catch (err) {
  // ignore watcher errors if DATA_DIR missing
}

// Retrieve top-k relevant chunks for a query using TF-IDF cosine-like scores
function retrieveTopK(query, k = 3) {
  if (!tfidf) return []
  const scores = []
  tfidf.tfidfs(query, function (i, measure) {
    scores.push({ index: i, score: measure })
  })
  scores.sort((a, b) => b.score - a.score)
  // apply threshold and boost priority docs
  const filtered = []
  for (const s of scores) {
    const doc = tfDocuments[s.index]
    if (!doc) continue
    const boost = doc.base && PRIORITY_BASES.has(doc.base) ? 2.0 : 1.0
    const adjusted = s.score * boost
    if (adjusted >= CONTEXT_TFIDF_THRESHOLD) filtered.push({ filename: doc.filename, snippet: doc.text, score: adjusted })
  }
  // return top-k of filtered results
  return filtered.slice(0, k)
}

// Derive simple prompt engineering rules from guides
// This is heuristic: searches for keywords that suggest task types and example structures
function deriveRules(guides) {
  const rules = {
    taskHints: {},
    examples: [],
    recommendedParameters: { temperature: 0.0, top_p: 1.0 },
  }

  const taskKeywords = {
    summarization: ['סיכום', 'תקציר', 'summariz'],
    translation: ['תרגום', 'translate', 'מתורגם'],
    analysis: ['ניתוח', 'analysis', 'הערכה'],
    creative: ['סיפור', 'יצירתי', 'creative', 'כתיבה'],
    instructions: ['הנחיות', 'שלבים', 'מדריך', 'steps'],
  }

  for (const g of guides) {
    const t = g.text || ''
    // collect examples: take first 500 chars as example
    const example = t.trim().slice(0, 800)
    if (example) rules.examples.push({ filename: g.filename, snippet: example })

    for (const [task, kws] of Object.entries(taskKeywords)) {
      for (const kw of kws) {
        if (t.indexOf(kw) !== -1) {
          rules.taskHints[task] = rules.taskHints[task] || []
          rules.taskHints[task].push(g.filename)
          break
        }
      }
    }
  }

  // If guides mention 'creative' or 'story' recommend higher temperature
  if (rules.taskHints.creative) {
    rules.recommendedParameters.temperature = 0.7
  }

  // Provide basic prompt patterns
  rules.patterns = {
    summarization:
      'Context: {context}\nInstruction: Summarize the following in Hebrew, keeping important points and examples.\nOutput format: Bullet points or short paragraph.\nParameters: temperature=0.0, top_p=1.0',
    translation:
      'Context: {context}\nInstruction: Translate the following text to the target language precisely, preserving meaning and tone.\nOutput format: Translated text only.\nParameters: temperature=0.0, top_p=1.0',
    analysis:
      'Context: {context}\nInstruction: Analyze the following and provide structured findings and recommendations.\nOutput format: Sections with headings: Summary, Findings, Recommendations.\nParameters: temperature=0.0, top_p=1.0',
    creative:
      'Context: {context}\nInstruction: Create a creative piece based on the input. Keep tone as specified.\nOutput format: Complete story or creative output.\nParameters: temperature=0.7, top_p=1.0',
  }

  return rules
}

// Endpoint: get derived rules (reads DATA folder)
app.get('/api/rules', async (req, res) => {
  try {
    const guides = await readGuides()
    const rules = deriveRules(guides)
    // build TF-IDF index for retrieval
    await buildIndex()
    res.json({
      ok: true,
      guides: guides.map((g) => g.filename),
      rules,
      indexSize: tfDocuments.length,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Endpoint: build professional prompt from user input (Hebrew expected)
app.post('/api/build', async (req, res) => {
  const { text } = req.body
  if (!text)
    return res.status(400).json({ ok: false, error: 'Missing text in request' })

  try {
    const guides = await readGuides()
    const rules = deriveRules(guides)
    // accept optional parameters
    const modelRequested = req.body.model || null
    const outLang = req.body.outLang || 'he'
    if (req.body.temperature)
      rules.recommendedParameters.temperature = req.body.temperature
    if (req.body.top_p) rules.recommendedParameters.top_p = req.body.top_p

    // Determine task: improved heuristics based on Hebrew keywords
    const lower = text.toLowerCase()
    let task = null
    if (/(סיכום|תקציר)/.test(lower)) task = 'summarization'
    else if (/(תרגום|translate)/.test(lower)) task = 'translation'
    else if (/(ניתוח|הערכה|analyz)/.test(lower)) task = 'analysis'
    else if (/(סיפור|יצירתי|כתיבה|creative)/.test(lower)) task = 'creative'
    else if (/(קוד|תוכנית|תכנית|לכתוב קוד|game|משחק|טטריס|tetris)/.test(lower))
      task = 'creative'
    else task = 'analysis' // default fallback

    // Try to improve classification using TF-IDF aggregated scores per task (if index available)
    let classification = { source: 'regex', task, scores: {} }
    try {
      if (
        tfidf &&
        rules &&
        rules.taskHints &&
        Object.keys(rules.taskHints).length
      ) {
        // initialize scores
        const taskScores = {}
        for (const t of Object.keys(rules.patterns || {})) taskScores[t] = 0

        // compute tfidf measures for the query and aggregate by task based on file membership
        tfidf.tfidfs(text, function (i, measure) {
          const doc = tfDocuments[i]
          if (!doc) return
          for (const [t, files] of Object.entries(rules.taskHints)) {
            if (files.includes(doc.filename)) {
              taskScores[t] = (taskScores[t] || 0) + measure
            }
          }
        })

        // choose best task by score
        const entries = Object.entries(taskScores).sort((a, b) => b[1] - a[1])
        if (entries.length && entries[0][1] > 0) {
          const best = entries[0][0]
          classification = { source: 'tfidf', task: best, scores: taskScores }
          task = best
        } else {
          classification = { source: 'regex', task, scores: taskScores }
        }
      }
    } catch (err) {
      // on error keep regex-based task
      classification = { source: 'regex', task, scores: {} }
    }

    // Select pattern
    const pattern = rules.patterns[task] || rules.patterns.analysis
    // Retrieve top-k relevant chunks as context
    const retrieved = retrieveTopK(text, 3)
    const example = retrieved && retrieved.length ? retrieved[0] : null

    // Build the professional prompt in English, ready to paste into GPT-like platforms
    // Helpers: detect code-like snippets and format them into fenced blocks with a short description
    function isCodeSnippet(text) {
      if (!text || typeof text !== 'string') return false
      const codeIndicators = [
        'const ',
        'let ',
        'function ',
        '=>',
        '{\n',
        ';\n',
        'import ',
        'class ',
        '#include',
        'def ',
        'console.log',
        'fetch(',
      ]
      let score = 0
      for (const ind of codeIndicators) if (text.indexOf(ind) !== -1) score++
      // also treat as code if many lines and many semicolons
      const lines = text.split(/\r?\n/).length
      const semis = (text.match(/;/g) || []).length
      if (lines > 3 && semis > 1) score += 2
      return score >= 2
    }

    function detectLanguage(text) {
      if (!text) return 'text'
      if (/\b(function|const|let|=>|console\.log)\b/.test(text)) return 'javascript'
      if (/\b(def |import |print\()/.test(text)) return 'python'
      if (/^<\?php|echo\s+\$/m.test(text)) return 'php'
      return 'text'
    }

    function describeSnippet(text) {
      const t = (text || '').toLowerCase()
      if (t.includes('authorization') || t.includes('bearer') || t.includes('token'))
        return 'Retrieves a valid Bearer token and sets HTTP headers.'
      if (t.includes('fetch(') || t.includes('axios') || t.includes('http'))
        return 'Example: HTTP request with headers and JSON payload.'
      if (t.includes('class ') || t.includes('new ')) return 'Class or constructor example.'
      if (t.includes('def ') || t.includes('import ')) return 'Python function example.'
      return 'Code example demonstrating the described behavior.'
    }

    function formatSnippet(text, filename) {
      if (!text) return ''
      const short = text.slice(0, 3000)
      if (isCodeSnippet(short)) {
        const lang = detectLanguage(short)
        const desc = describeSnippet(short)
        // ensure snippet lines are not excessively long
        const safeSnippet = short
          .split(/\r?\n/)
          .map((l) => l.trimEnd())
          .join('\n')
    return `// From ${filename}: ${desc}\n\n\`\`\`${lang}\n${safeSnippet}\n\`\`\`\n`
      }
      // plain text: collapse whitespace and return a short paragraph
      const collapsed = short.replace(/\s+/g, ' ').trim()
      return collapsed
    }
    const contextSection = example
      ? formatSnippet(example.snippet.slice(0, 800), example.filename)
      : 'Context: No example available from the guides.'
    
      

    // Instruction: include the original Hebrew request and a clear English instruction for the model
    const instructionHebrew = text
    const instructionEnglish = `Please carry out the request below exactly as specified. The user's request is provided in Hebrew; prefer responding in Hebrew unless the user explicitly requests another language.`

    // Output format in English depending on task
    let outputFormatEnglish = ''
    if (task === 'summarization') {
      outputFormatEnglish =
        'Output format: Provide a concise summary with bullet points and a short paragraph. Keep it in Hebrew.'
    } else if (task === 'translation') {
      outputFormatEnglish =
        'Output format: Provide only the translated text, preserving meaning and tone.'
    } else if (task === 'analysis') {
      outputFormatEnglish =
        'Output format: Use sections with headings: Summary, Findings, Recommendations. Use bullet points where appropriate.'
    } else if (task === 'creative') {
      outputFormatEnglish =
        'Output format: Provide the creative output or runnable code (if code requested). For code include a single code block and a short explanation.'
    } else {
      outputFormatEnglish =
        'Output format: Provide a clear, structured response. Use headings and bullets where useful.'
    }

    const params = rules.recommendedParameters || {
      temperature: 0.0,
      top_p: 1.0,
    }

    // Prefer few-shot examples from files suggested by rules.taskHints for this task
    let fewShotEnglish = ''
    try {
      const taskFiles = (rules.taskHints && rules.taskHints[task]) || []
      if (taskFiles && taskFiles.length) {
        // find matching guides and take first snippets from tfDocuments
        const examples = []
        for (const td of tfDocuments) {
          if (taskFiles.includes(td.filename) && examples.length < 3) {
            examples.push(formatSnippet(td.text.slice(0, 800), td.filename))
          }
        }
        if (examples.length) fewShotEnglish = examples.join('\n\n')
      }
    } catch (e) {
      fewShotEnglish = ''
    }

    if (!fewShotEnglish && retrieved && retrieved.length) {
      fewShotEnglish = retrieved
        .map((r) => formatSnippet(r.snippet.slice(0, 800), r.filename))
        .join('\n\n')
    }

    const professionalPrompt = [
      'System: You are an expert, concise, and highly reliable assistant. Follow instructions exactly and produce final results without asking for clarifying questions unless explicitly requested.',
      '',
      `Context:\n${contextSection}`,
      '',
      fewShotEnglish,
      `User request (Hebrew): ${instructionHebrew}`,
      '',
      `Instruction (English): ${instructionEnglish}`,
      '',
      `Task type: ${task}`,
      '',
      `${outputFormatEnglish}`,
      '',
      `Recommended model: ${
        task === 'creative' ? 'claude-2.1 (or GPT-4)' : 'gpt-4'
      }`,
      `Recommended parameters: temperature=${params.temperature}, top_p=${
        params.top_p
      }, top_k=${params.top_k || 'N/A'}`,
      '',
      'Behavioral guidelines:\n- Be precise and concise.\n- Use headings and bullet points.\n- When returning code, include runnable code in a single code block and a brief explanation.',
      '',
      'Return only the requested output according to the Output format.',
    ].join('\n')

    const modelRecommendation =
      task === 'creative' ? 'claude-2.1 (or GPT-4)' : 'gpt-4'

    // finalPrompt: compact, paste-ready prompt intended to send straight to GPT-like models
    const finalPrompt = [
      'SYSTEM: You are an expert assistant. Follow the instructions exactly and respond concisely.',
      '',
      `CONTEXT: ${contextSection.replace(/\n/g, ' ')}`,
      '',
      fewShotEnglish ? `EXAMPLE: ${fewShotEnglish.replace(/\n/g, ' ')}` : '',
      `USER_REQUEST: ${instructionHebrew}`,
      '',
      `INSTRUCTION: ${instructionEnglish}`,
      '',
      `OUTPUT_FORMAT: ${outputFormatEnglish}`,
      '',
      `RECOMMENDED_MODEL: ${modelRecommendation}`,
      `PARAMETERS: temperature=${params.temperature}, top_p=${params.top_p}`,
      '',
      'NOTE: Return only the requested output. Do not include internal commentary.',
    ]
      .filter(Boolean)
      .join('\n')

    res.json({
      ok: true,
      task,
      classification,
      professionalPrompt,
      finalPrompt,
      modelRecommendation: modelRequested || modelRecommendation,
      params: rules.recommendedParameters,
      retrieved,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`)
)
