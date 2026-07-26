# LLM Context Extractor

A Chrome extension that extracts conversations from ChatGPT, Claude, and Gemini, then compresses them into structured context using the Gemini API — stripping noise while keeping decisions, goals, code, and unresolved questions.

---

## What it does

LLM conversations get long. This extension captures a full conversation, runs it through a local scoring pipeline (chunker → scorer → extractor), and returns a compressed snapshot you can copy back into any LLM as clean context.

```
Raw conversation (100+ messages)
        ↓
  chunk + score each message
        ↓
  drop noise, compress mid, keep critical
        ↓
  Gemini extracts structured JSON
        ↓
{ goal, decisions, currentState, codeBlocks, unresolvedQuestions }
```

---

## Features

- **Extracts** conversations directly from ChatGPT, Claude, and Gemini pages
- **Compresses** using a weighted scoring model (recency + type + keywords + cross-references)
- **Structured output** — goal, decisions, current state, unresolved questions, code blocks
- **Accordion UI** — each section collapsible; code blocks expand inline with syntax highlighting
- **Copy to clipboard** — copies context without raw code (replaces code with language + description)
- **History tab** — last 30 sessions saved locally, click any to reload

---

## Project structure

```
GetllmContent/
├── manifest.json
├── background.js          # service worker — loads utils, handles messages
├── content.js             # runs on LLM pages, extracts raw messages
├── popup.html / popup.js  # extension UI
├── styles.css
└── utils/
    ├── parser.js          # page-specific DOM parsers (ChatGPT / Claude / Gemini)
    ├── modelTypes.js      # Message, ScoredChunk, CodeBlock, etc.
    ├── chunker.js         # tags each message with a ChunkType
    ├── scorer.js          # scores chunks: keep / compress / drop
    └── llm_extractor.js   # builds prompts, calls Gemini API, parses response
```

---

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/MENT0Z/context-compressor.git
```

**2. Load into Chrome**
- Go to `chrome://extensions`
- Enable **Developer mode** (top right)
- Click **Load unpacked** → select the `GetllmContent` folder

**3. Add your Gemini API key**
- Open the extension popup
- Paste your key into the API key field → click **Save**
- Get a key at [aistudio.google.com](https://aistudio.google.com/app/apikey)

---

## Usage

1. Open a ChatGPT, Claude, or Gemini conversation
2. Click the extension icon
3. Click **① Extract** — grabs all messages from the page
4. Click **② Process** — sends to Gemini, returns compressed context (10–30s)
5. Expand sections to read, or **Copy** to paste into a new chat

---

## How scoring works

Each message gets a score from 0–1 based on four factors:

| Factor | Weight | What it checks |
|---|---|---|
| Recency | 35% | Last 20% of conversation scores highest |
| Type | 30% | Code 0.95 · Decision 0.90 · Correction 0.85 · Info 0.50 · Question 0.40 |
| Keywords | 20% | Hits on: error, fix, schema, api, auth, final, etc. |
| Cross-reference | 15% | Is this message referenced by later messages? |

Scores ≥ 0.65 → **keep verbatim** · 0.35–0.65 → **compress** · < 0.35 → **drop**

---

## Tech

- Chrome Extension Manifest V3
- Vanilla JS (no build step, no bundler)
- Gemini API (`gemma-3-27b-it` via REST)
- Token estimation: ~4 chars/token (no WASM dependency)

---

## Limitations

- Parser accuracy depends on the LLM site's DOM — may break on UI updates
- Gemini API key is stored in `chrome.storage.sync` (not exposed to page scripts)
- No server, no account — everything runs locally except the Gemini API call
