const express = require('express')
const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const natural = require('natural')

// tokenizer and TF-IDF index (in-memory)
// Add Hebrew normalization and light stemming to improve token matching
function normalizeHebrew(text) {
  if (!text) return ''
  let t = text.toString().toLowerCase()
  t = t.replace(/[\u0591-\u05C7]/g, '')
  t = t.replace(/[^a-z0-9\u0590-\u05FF\u200c\u200d]+/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function stemHebrewToken(tok) {
  const suffixes = [
    'ויות',
    'יות',
    'ויות',
    'ים',
    'ות',
    'ה',
    'ו',
    'י',
    'ת',
    'נו',
    'כם',
    'כן',
    'יהם',
    'יהן',
  ]
  for (const sfx of suffixes) {
    if (tok.length > sfx.length + 2 && tok.endsWith(sfx)) {
      return tok.slice(0, -sfx.length)
    }
  }
  return tok
}

function tokenizeNormalized(text) {
  const norm = normalizeHebrew(text)
  if (!norm) return []
  return norm.split(' ').map(stemHebrewToken).filter(Boolean)
}
const tokenizer = { tokenize: tokenizeNormalized }
let tfidf = null
let tfDocuments = []
let PRIORITY_BASES = new Set()
let embeddingsIndex = null
let localVectors = null // { vocab: [...], vectors: [{filename,text,vec}], idf: {} }

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

function getActiveThreshold() {
  const t = process.env.TEST_THRESHOLD
  if (t !== undefined) {
    const v = parseFloat(t)
    if (!Number.isNaN(v)) return v
  }
  return CONTEXT_TFIDF_THRESHOLD
}

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

// Load persisted local_vectors.json if present (so we can use it as fallback)
try {
  const lvPath = path.join(DATA_DIR, 'local_vectors.json')
  if (fs.existsSync(lvPath)) {
    const raw = fs.readFileSync(lvPath, 'utf8')
    localVectors = JSON.parse(raw)
    console.log(
      'Loaded persisted local_vectors entries=',
      localVectors.vectors.length
    )
  }
} catch (e) {
  console.error('failed loading persisted local_vectors.json', e.message)
  localVectors = null
}

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
  // load summaries if present (to allow short summaries as additional retrievable docs)
  let summaries = []
  try {
    const sPath = path.join(DATA_DIR, 'summaries.json')
    if (fs.existsSync(sPath)) {
      const raw = await fs.promises.readFile(sPath, 'utf8')
      summaries = JSON.parse(raw)
    }
  } catch (e) {
    console.error('failed loading summaries.json', e.message)
  }
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

  // also add summaries as lightweight documents (filename: summary:<filename>)
  for (const s of summaries) {
    try {
      const text = (s.summary || '').toString()
      if (text && text.length > 20) {
        tfDocuments.push({
          id: id++,
          filename: `summary:${s.filename}`,
          base: path.basename(s.filename, path.extname(s.filename)),
          text,
        })
        tfidf.addDocument(text)
      }
    } catch (e) {
      // ignore malformed summary entries
    }
  }
  // try to load embeddings index if present
  try {
    const embPath = path.join(DATA_DIR, 'embeddings.json')
    if (fs.existsSync(embPath)) {
      const raw = await fs.promises.readFile(embPath, 'utf8')
      embeddingsIndex = JSON.parse(raw)
      console.log('Loaded embeddings index entries=', embeddingsIndex.length)
    } else {
      embeddingsIndex = null
    }
  } catch (e) {
    console.error('failed loading embeddings.json', e.message)
    embeddingsIndex = null
  }
  // build local TF-IDF vectors for cosine fallback
  try {
    const vocab = {}
    const docTokens = []
    for (let i = 0; i < tfDocuments.length; i++) {
      const doc = tfDocuments[i]
      const toks = tokenizeNormalized(doc.text || '')
      docTokens.push(toks)
      for (const t of toks) vocab[t] = (vocab[t] || 0) + 1
    }
    const vocabList = Object.keys(vocab).slice(0, 5000) // limit size
    const idf = {}
    for (const w of vocabList) {
      let df = 0
      for (const toks of docTokens) if (toks.includes(w)) df++
      idf[w] = Math.log((1 + tfDocuments.length) / (1 + df))
    }
    const vectors = []
    for (let i = 0; i < tfDocuments.length; i++) {
      const doc = tfDocuments[i]
      const vec = new Array(vocabList.length).fill(0)
      for (let j = 0; j < vocabList.length; j++) {
        const w = vocabList[j]
        const toks = tokenizeNormalized(doc.text || '')
        const tf = toks.filter((x) => x === w).length
        vec[j] = tf * (idf[w] || 0)
      }
      vectors.push({ filename: doc.filename, text: doc.text, vec })
    }
    localVectors = { vocab: vocabList, vectors, idf }
    console.log('Built local vectors entries=', vectors.length)
  } catch (e) {
    console.error('local vectors build error', e.message)
    localVectors = null
  }
}

// Watch data directory but ignore temporary editor/OS files and debounce rapid events
let watchTimer = null
let buildingIndex = false
const shouldIgnore = (name) => {
  if (!name) return true
  const base = path.basename(name)
  // ignore Office temp files, .tmp, hidden, and generated index files
  if (base.startsWith('~$')) return true
  if (base.endsWith('.tmp')) return true
  if (base.startsWith('.')) return true
  const generated = [
    'local_vectors.json',
    'embeddings.json',
    'summaries.json',
    'server.log',
  ]
  if (generated.includes(base)) return true
  return false
}

fs.watch(DATA_DIR, { recursive: true }, (eventType, filename) => {
  if (shouldIgnore(filename)) return
  const full = path.join(DATA_DIR, filename || '')
  console.log('data dir change detected:', eventType, full)
  if (buildingIndex) {
    console.log('build already in progress, skipping event')
    return
  }
  if (watchTimer) clearTimeout(watchTimer)
  watchTimer = setTimeout(async () => {
    try {
      buildingIndex = true
      await buildIndex()
    } catch (e) {
      console.error('error during buildIndex from watcher', e.message)
    } finally {
      buildingIndex = false
      watchTimer = null
    }
  }, 700)
})

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
  const activeThreshold = getActiveThreshold()
  for (const s of scores) {
    const doc = tfDocuments[s.index]
    if (!doc) continue
    const boost = doc.base && PRIORITY_BASES.has(doc.base) ? 2.0 : 1.0
    const adjusted = s.score * boost
    if (adjusted >= activeThreshold)
      filtered.push({
        filename: doc.filename,
        snippet: doc.text,
        score: adjusted,
      })
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
    // Retrieve top-k relevant chunks as context: try embeddings first, fallback to TF-IDF
    let retrieved = []
    try {
      const emb = await retrieveTopKEmbeddings(text, 3)
      if (emb && emb.length) retrieved = emb
      else retrieved = retrieveTopK(text, 3)
    } catch (e) {
      retrieved = retrieveTopK(text, 3)
    }
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
      if (/\b(function|const|let|=>|console\.log)\b/.test(text))
        return 'javascript'
      if (/\b(def |import |print\()/.test(text)) return 'python'
      if (/^<\?php|echo\s+\$/m.test(text)) return 'php'
      return 'text'
    }

    function describeSnippet(text) {
      const t = (text || '').toLowerCase()
      if (
        t.includes('authorization') ||
        t.includes('bearer') ||
        t.includes('token')
      )
        return 'Retrieves a valid Bearer token and sets HTTP headers.'
      if (t.includes('fetch(') || t.includes('axios') || t.includes('http'))
        return 'Example: HTTP request with headers and JSON payload.'
      if (t.includes('class ') || t.includes('new '))
        return 'Class or constructor example.'
      if (t.includes('def ') || t.includes('import '))
        return 'Python function example.'
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

    // Image request helpers (defined here so they are available regardless of retrieval result)
    function isImageRequest(text) {
      if (!text) return false
      const t = text.toLowerCase()
      const keywords = [
        'תמונה',
        'צור לי תמונה',
        'צייר',
        'generate image',
        'create image',
        'midjourney',
        'dalle',
        'stable diffusion',
        'render',
        'image of',
        'draw',
      ]
      return keywords.some((k) => t.includes(k))
    }

    function buildImagePromptEnglish(originalHebrew) {
      const base = (originalHebrew || '').toString()
      // simple mapping: try to detect a few Hebrew subjects; fallback to a safe example
      let subject = 'an old man smoking a cigar'
      if (/טטריס|טטריס/i.test(base))
        subject = 'a retro Tetris game UI, neon colors, isometric view'
      // pull adjectives if present (very naive)
      const adjectives = []
      const adjMatches = base.match(/(זקן|צעיר|חייכן|עצבני|יפה|מרגש|דרמטי)/g)
      if (adjMatches && adjMatches.length) adjectives.push(...adjMatches)
      const style = 'photorealistic, cinematic'
      const lighting = 'dramatic low-key lighting'
      const camera = '50mm, shallow depth of field'
      const mood = adjectives.length
        ? adjectives.join(', ')
        : 'moody, introspective'
      const color = 'warm tones'
      const negative = 'no text, no watermark, avoid blur'
      const prompt = `${subject}, ${style}, ${mood}, ${lighting}, ${camera}, ${color} --v 5 --ar 3:4 --quality 2.0 | ${negative}`
      return prompt
    }
    let contextSection = ''
    if (example) {
      contextSection = formatSnippet(
        example.snippet.slice(0, 800),
        example.filename
      )
    } else {
      // Helper: detect if the user is requesting an image generation prompt
      function isImageRequest(text) {
        if (!text) return false
        const t = text.toLowerCase()
        const keywords = [
          'תמונה',
          'צור לי תמונה',
          'צייר',
          'generate image',
          'create image',
          'midjourney',
          'dalle',
          'stable diffusion',
          'render',
          'image of',
          'draw',
        ]
        return keywords.some((k) => t.includes(k))
      }

      function buildImagePromptEnglish(originalHebrew) {
        // basic heuristic: translate key descriptors or prompt user for missing info; build a detailed Midjourney-style prompt
        // We'll create a conservative default cover: subject, age, clothing, mood, lighting, style, camera
        // If the Hebrew contains some adjectives, attempt to include them naively.
        const base = originalHebrew || ''
        // naive extraction (could be improved with NLP)
        const englishSubject = 'an old man smoking a cigar'
        const style = 'photorealistic, cinematic'
        const lighting = 'dramatic low-key lighting'
        const camera = '50mm, shallow depth of field'
        const mood = 'moody, introspective'
        const color = 'warm tones'
        const negative = 'no text, no watermark, avoid blur'
        const prompt = `${englishSubject}, ${style}, ${mood}, ${lighting}, ${camera}, ${color} --v 5 --ar 3:4 --quality 2.0 | ${negative}`
        return prompt
      }
      // fallback: try to load summaries.json and pick a summary that matches task or priority
      try {
        const sPath = path.join(DATA_DIR, 'summaries.json')
        if (fs.existsSync(sPath)) {
          const sums = JSON.parse(await fs.promises.readFile(sPath, 'utf8'))
          // forced map: exact keyword -> filename
          const FORCED_SUMMARY_MAP = {
            tetris: '12-tutorial-tetris.markdown',
            טטריס: '12-tutorial-tetris.markdown',
            game: '13-example-react-game.markdown',
            משחק: '13-example-react-game.markdown',
          }
          const lowerQuery = (text || '').toLowerCase()
          let forcedChosen = null
          for (const [kw, fname] of Object.entries(FORCED_SUMMARY_MAP)) {
            if (lowerQuery.includes(kw)) {
              const found = sums.find(
                (x) => x.filename === fname || x.filename.endsWith(fname)
              )
              if (found) {
                forcedChosen = found
                break
              }
            }
          }
          if (forcedChosen) {
            contextSection = `Context (forced summary from ${forcedChosen.filename}):\n${forcedChosen.summary}`
          } else {
            // Prefer entries with priority tag, otherwise use a task->tags mapping
            const prefer = []
            const scored = []
            const TASK_TAG_MAP = {
              summarization: [
                'summary',
                'overview',
                'analysis',
                'סיכום',
                'תקציר',
              ],
              translation: ['translate', 'translation', 'language', 'תרגום'],
              analysis: [
                'analysis',
                'security',
                'performance',
                'deploy',
                'ניתוח',
                'אבטחה',
                'ביצועים',
              ],
              creative: [
                'tetris',
                'game',
                'canvas',
                'react',
                'javascript',
                'משחק',
                'טטריס',
                'יצירתי',
              ],
              instructions: [
                'tutorial',
                'guide',
                'tutorial-tetris',
                'tetris',
                'מדריך',
                'הדרכה',
              ],
              ui: ['ui', 'ux', 'interface', 'עיצוב', 'ממשק', 'layout'],
              performance: [
                'performance',
                'fps',
                'memory',
                'ביצועים',
                'פרופיילינג',
              ],
              input: ['input', 'keyboard', 'touch', 'קלט', 'מקלדת', 'מגע'],
            }
            const wanted = TASK_TAG_MAP[task] || [task]
            for (const s of sums) {
              const ttags = (s.tags || []).map((x) => x.toLowerCase())
              if (ttags.includes('priority') || /priority/i.test(s.filename))
                prefer.push(s)
              // score by overlap with wanted tags
              let score = 0
              for (const w of wanted) if (ttags.includes(w)) score++
              scored.push({ s, score })
            }
            // pick best: prefer priority entries first, otherwise highest score, otherwise first available
            let chosen = null
            if (prefer.length) chosen = prefer[0]
            else {
              scored.sort((a, b) => b.score - a.score)
              if (scored.length && scored[0].score > 0) chosen = scored[0].s
              else if (sums.length) chosen = sums[0]
            }
            if (chosen)
              contextSection = `Context (summary from ${chosen.filename}):\n${chosen.summary}`
          }
        }
      } catch (e) {
        contextSection = 'Context: No example available from the guides.'
      }
      if (!contextSection)
        contextSection = 'Context: No example available from the guides.'
    }

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

    let professionalPrompt = ''
    if (isImageRequest(text)) {
      // Image-focused professional prompt: ask for a single-line, high-detail English prompt
      const imagePrompt = buildImagePromptEnglish(text)
      professionalPrompt = [
        'System: You are an expert visual prompt engineer. Produce a single, detailed English prompt suitable for Midjourney/Stable Diffusion/DALLE.',
        '',
        `User request (Hebrew): ${instructionHebrew}`,
        '',
        'Instruction (English): Generate one single-line, high-detail image prompt in English. Do not include extra commentary. Include style, mood, lighting, camera, and negative constraints if applicable.',
        '',
        `Final image prompt: ${imagePrompt}`,
      ].join('\n')
      // ensure we don't include unrelated context or examples
      contextSection = ''
      fewShotEnglish = ''
    } else {
      professionalPrompt = [
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
    }

    const modelRecommendation =
      task === 'creative' ? 'claude-2.1 (or GPT-4)' : 'gpt-4'

    // finalPrompt: compact, paste-ready prompt intended to send straight to GPT-like models
    let finalPrompt = ''
    if (isImageRequest(text)) {
      finalPrompt = buildImagePromptEnglish(text)
    } else {
      finalPrompt = [
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
    }

    // Async embeddings-based retrieval: compute query embedding via OpenAI and score against local embeddings.json
    async function retrieveTopKEmbeddings(query, k = 3) {
      if (!embeddingsIndex || !embeddingsIndex.length) return null
      const key = process.env.OPENAI_API_KEY
      if (!key) return null
      // prefer node-fetch or global fetch; use built-in fetch if available
      const fetchFn = global.fetch || require('node-fetch')
      if (!fetchFn) return null

      try {
        const resp = await fetchFn('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: query,
          }),
        })
        if (!resp.ok) return null
        const j = await resp.json()
        const qVec = (j.data && j.data[0] && j.data[0].embedding) || null
        if (!qVec) return null

        function dot(a, b) {
          let s = 0
          for (let i = 0; i < a.length; i++) s += a[i] * b[i]
          return s
        }
        function norm(a) {
          let s = 0
          for (let i = 0; i < a.length; i++) s += a[i] * a[i]
          return Math.sqrt(s)
        }

        const scored = []
        for (const item of embeddingsIndex) {
          if (!item.embedding) continue
          const score =
            dot(qVec, item.embedding) /
            (norm(qVec) * norm(item.embedding) + 1e-12)
          scored.push({ item, score })
        }
        scored.sort((a, b) => b.score - a.score)
        const results = []
        for (const s of scored.slice(0, k)) {
          results.push({
            filename: s.item.filename,
            snippet: s.item.text,
            score: s.score,
          })
        }
        return results
      } catch (e) {
        console.error('embeddings retrieval error', e.message)
        return null
      }
    }

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
