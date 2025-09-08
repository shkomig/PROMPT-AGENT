# Hebrew Professional Prompt Builder

Minimal Node.js + Express project that reads guides from the `data/` directory, derives simple prompt-engineering rules, and provides a web UI (Hebrew, RTL) to generate a professional prompt.

Features:

- Reads text and PDF files in `data/` (PDFs via `pdf-parse`).
- Heuristics to detect task types (summarization, translation, analysis, creative).
- Builds a professional prompt with Context, Instruction, Output format, and recommended parameters.
- Displays a recommended model.

Run locally:

1. Install Node.js (v16+ recommended).
2. In a PowerShell terminal, run:

```powershell
cd 'C:\AI-APP\Prompt -agent-01'
npm install
npm start
```

3. Open http://localhost:3000 in your browser.

Notes and assumptions:

- The DATA directory is `data/` at project root and must contain files readable by the server. If inaccessible, the UI shows an error when loading rules.
- The prompt classification is heuristic and uses simple keyword matching. For production, replace with a classifier or embeddings-based search.

Parameter explanations (Hebrew)

- temperature: שולט בהסתברות התגובות. ערך נמוך (0.0) ידגיש תשובות צפויות וקונסיסטנטיות — טוב למשימות קוד או סיכומים. ערך גבוה (0.6–0.9) מייצר יצירתיות או ניסוחים חדשים — טוב למשימות יצירתיות.
- top_p: nucleus sampling — בוחר את המילים מתוך תת-קבוצה של המודל עד שמצטבר סיכוי של top_p. ערך 1.0 = אין סינון; ערכים נמוכים יכולים להפוך את התשובות ליותר ממוקדות.
- top_k: (לא בשימוש ברירת מחדל כאן) — מגביל את האפשרויות למילים התנוססות-top_k. שימושי לצמצום בחירה מקרית.
- model recommendation: המערכת ממליצה (GPT‑4 או Claude) בהתאם לסוג המשימה ולטון; ניתן לבחור מודל ידנית בממשק.

אופן השימוש האולטימטיבי בפרמטרים

- למשימות קוד וסיכומים: temperature=0.0, top_p=1.0
- למשימות ניתוח והסקת מסקנות: temperature=0.0–0.2, top_p=0.9–1.0
- למשימות יצירתיות (כתיבה/סיפורים/משחקים): temperature=0.6–0.9, top_p=0.9–1.0
