// // extractor.js

// import fs from "fs";
// import dotenv from "dotenv";
// import { GoogleGenAI } from "@google/genai";
// import { v4 as uuidv4 } from "uuid";

// import { scoreChunks } from "./scorer.js";
// import {
//     ChunkType,
//     CodeBlock,
//     CodeReference,
//     Message
// } from "./modelTypes.js";
// import { chunkConversation } from "./chunker.js";

// dotenv.config();

// export const codeStore = {};
// export const references = {};

// export function extractCodeChunks(chunks) {
//     return chunks.filter(
//         chunk =>
//             chunk.type.toLowerCase() === "code" &&
//             chunk.decision.toLowerCase() !== "drop"
//     );
// }

// export function buildCodePrompt(codeChunks) {

//     const codeText = [];

//     codeChunks.forEach((chunk, i) => {

//         codeText.push(`
// CODE ${i}

// ${chunk.message.text}
// `);
//     });

//     return `
// You are analysing code snippets.

// For each snippet return

// [
// {
// "language":"string — programming language used",
// "description":"describe in one line what this code does"
// }
// ]

// Rules

// - one sentence only
// - identify language
// - no markdown
// - valid json only

// Snippets

// ${codeText.join("\n\n-----------------\n")}
// `;
// }

// export function buildExtractionPrompt(chunks) {

//     const filteredConvo = [];

//     for (const chunk of chunks) {

//         if (chunk.decision.toLowerCase() === "drop") {
//             continue;
//         }

//         const prefix =
//             chunk.decision.toLowerCase() === "compress" &&
//             chunk.type.toLowerCase() === "code"
//                 ? "[SUMMARISE THIS]"
//                 : "[KEEP VERBATIM]";

//         if (chunk.type.toLowerCase() === "code") {

//             const ref = references[chunk.index];

//             filteredConvo.push(`
// ${chunk.message.role.toUpperCase()} [CODE]

// Reference: ${ref.ref_id}

// Language:
// ${ref.language}

// Summary:
// ${ref.description}

// whenever you need to cite this code use the refno.
// `);
//         }
//         else {

//             filteredConvo.push(
// `${chunk.message.role.toUpperCase()} ${prefix}:
// ${chunk.message.text}`
//             );
//         }
//     }

//     return `
// You are a conversation memory compressor.

// Extract structured context from this filtered conversation.

// CONVERSATION:

// ${filteredConvo.join("\n\n---\n\n")}

// OUTPUT RULES:

// - Respond ONLY with valid JSON matching the schema below
// - For blocks marked [KEEP VERBATIM]: include them EXACTLY as written
// - For sections marked [SUMMARISE THIS]: condense to the essential point only
// - Be ruthlessly concise — every word costs tokens
// - goal: one sentence max
// - decisions: bullet points of things concluded/agreed
// - currentState: what was being worked on at the very end
// - unresolvedQuestions: things asked but not answered

// JSON SCHEMA:

// {
// "goal":"string",
// "decisions":["string"],
// "currentState":"string",
// "unresolvedQuestions":["string"]
// }

// Respond with JSON only.
// `;
// }

// export async function getResponseFromGemma(prompt) {

//     const client = new GoogleGenAI({
//         apiKey: process.env.GOOGLE_API_KEY
//     });
//     // console.log(process.env.GOOGLE_API_KEY);
//     const response = await client.models.generateContent({
//         model: "gemma-4-31b-it",
//         contents: prompt
//     });

//     return response.text;
// }

// // If you want to use OpenRouter instead
// export async function getResponseFromOpenRouter(prompt) {

//     const response = await fetch(
//         "https://openrouter.ai/api/v1/chat/completions",
//         {
//             method: "POST",
//             headers: {
//                 Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 model: "openrouter/free",
//                 messages: [
//                     {
//                         role: "user",
//                         content: prompt
//                     }
//                 ],
//                 max_tokens: 1500
//             })
//         }
//     );

//     if (!response.ok) {
//         throw new Error(await response.text());
//     }

//     const data = await response.json();

//     return data.choices[0].message.content;
// }

// export async function extractWithLLM(chunks) {

//     const prompt = buildExtractionPrompt(chunks);

//     let rawText;

//     try {

//         rawText = await getResponseFromGemma(prompt);

//     } catch (e) {

//         console.log("Gemma failed:", e);

//         return {
//             goal: "Context recovery failed — original conversation unavailable",
//             decisions: [],
//             currentState: "",
//             codeBlocks: [],
//             unresolvedQuestions: []
//         };
//     }

//     console.log("LLM raw output type:", typeof rawText);
//     console.log(rawText);

//     const cleaned = rawText
//         .replace(/```json/g, "")
//         .replace(/```/g, "")
//         .trim();

//     try {

//         return JSON.parse(cleaned);

//     } catch (err) {

//         console.log("LLM returned invalid JSON");

//         return {
//             goal: "Context recovery failed — original conversation unavailable",
//             decisions: [],
//             currentState: rawText.substring(0, 500),
//             codeBlocks: [],
//             unresolvedQuestions: []
//         };
//     }
// }

// // ------------------------------
// // main()
// // ------------------------------

// async function main() {

//     const data = JSON.parse(
//         fs.readFileSync("D:\\context_compression\\demoChat.json", "utf8")
//     );

//     const totalMessages = data.messages.map(
//         message =>
//             new Message(
//                 message.role,
//                 message.text,
//                 message.timestamp
//             )
//     );

//     const chunks = chunkConversation(totalMessages);

//     const scoredChunks = scoreChunks(chunks);

//     const codeChunks = extractCodeChunks(scoredChunks);

//     const prompt = buildCodePrompt(codeChunks);

//     // const metadataText = await getResponseFromOpenRouter(prompt);

//     const metadataText = await getResponseFromGemma(prompt);

//     console.log("=================================");
//     console.log(metadataText);
//     console.log("=================================");

//     const metadata = JSON.parse(metadataText);

//     if (!Array.isArray(metadata)) {
//         throw new Error(
//             `Expected array but got ${typeof metadata}`
//         );
//     }

//     if (metadata.length !== codeChunks.length) {
//         throw new Error(
//             `Expected ${codeChunks.length} metadata items but got ${metadata.length}`
//         );
//     }

//     for (let i = 0; i < codeChunks.length; i++) {

//         const chunk = codeChunks[i];
//         const meta = metadata[i];

//         const ref = `code_${uuidv4().replace(/-/g, "").substring(0, 8)}`;

//         codeStore[ref] = new CodeBlock(
//             meta.language,
//             chunk.message.text,
//             meta.description
//         );

//         references[chunk.index] = new CodeReference(
//             ref,
//             meta.language,
//             meta.description
//         );
//     }

//     const extractedContext = await extractWithLLM(scoredChunks);

//     console.log(extractedContext);

//     extractedContext.codeBlocks = {};

//     for (const [ref, block] of Object.entries(codeStore)) {

//         extractedContext.codeBlocks[ref] = {
//             language: block.language,
//             code: block.code,
//             description: block.description
//         };
//     }

//     console.log("=================================");
//     console.log("=================================");

//     console.log(
//         JSON.stringify(
//             extractedContext,
//             null,
//             2
//         )
//     );
// }

// // ------------------------------
// // Run
// // ------------------------------

// main().catch(err => {
//     console.error(err);
// });

// utils/llm_extractor.js
// Plain script for use in background.js (service worker).
// Depends on: modelTypes.js, chunker.js, scorer.js  (imported via background.js)
//
// API keys are read from chrome.storage.sync.
// Set them once from popup options:
//   chrome.storage.sync.set({ GOOGLE_API_KEY: "your-key" })

// ── Stores (module-level, live for the lifetime of the service worker) ──

// const codeStore  = {};
// const references = {};

// // ── UUID (replaces npm `uuid`) ──
// function uuidv4() {
//     return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
//         (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
//     );
// }

// // ── Config from chrome.storage ──
// async function getConfig() {
//     return new Promise(resolve =>
//         chrome.storage.sync.get(["GOOGLE_API_KEY", "OPEN_ROUTER_API_KEY"], resolve)
//     );
// }

// // ── Pure logic (unchanged from original) ──
// function extractCodeChunks(chunks) {
//     return chunks.filter(c =>
//         c.type.toLowerCase() === "code" &&
//         c.decision.toLowerCase() !== "drop"
//     );
// }

// function buildCodePrompt(codeChunks) {
//     const codeText = codeChunks.map((chunk, i) => `\nCODE ${i}\n\n${chunk.message.text}\n`);
//     return `You are analysing code snippets.\n\nFor each snippet return\n\n[\n{\n"language":"string — programming language used",\n"description":"describe in one line what this code does"\n}\n]\n\nRules\n\n- one sentence only\n- identify language\n- no markdown\n- valid json only\n\nSnippets\n\n${codeText.join("\n\n-----------------\n")}`;
// }

// function buildExtractionPrompt(chunks) {
//     const filteredConvo = [];
//     for (const chunk of chunks) {
//         if (chunk.decision.toLowerCase() === "drop") continue;

//         const prefix =
//             chunk.decision.toLowerCase() === "compress" &&
//             chunk.type.toLowerCase() === "code"
//                 ? "[SUMMARISE THIS]"
//                 : "[KEEP VERBATIM]";

//         if (chunk.type.toLowerCase() === "code") {
//             const ref = references[chunk.index];
//             filteredConvo.push(`${chunk.message.role.toUpperCase()} [CODE]\n\nReference: ${ref.ref_id}\n\nLanguage:\n${ref.language}\n\nSummary:\n${ref.description}\n\nwhenever you need to cite this code use the refno.`);
//         } else {
//             filteredConvo.push(`${chunk.message.role.toUpperCase()} ${prefix}:\n${chunk.message.text}`);
//         }
//     }

//     return `You are a conversation memory compressor.\n\nExtract structured context from this filtered conversation.\n\nCONVERSATION:\n\n${filteredConvo.join("\n\n---\n\n")}\n\nOUTPUT RULES:\n\n- Respond ONLY with valid JSON matching the schema below\n- For blocks marked [KEEP VERBATIM]: include them EXACTLY as written\n- For sections marked [SUMMARISE THIS]: condense to the essential point only\n- Be ruthlessly concise — every word costs tokens\n- goal: one sentence max\n- decisions: bullet points of things concluded/agreed\n- currentState: what was being worked on at the very end\n- unresolvedQuestions: things asked but not answered\n\nJSON SCHEMA:\n\n{\n"goal":"string",\n"decisions":["string"],\n"currentState":"string",\n"unresolvedQuestions":["string"]\n}\n\nRespond with JSON only.`;
// }

// // ── Gemini REST call (replaces GoogleGenAI SDK) ──
// async function getResponseFromGemma(prompt) {
//     const config = await getConfig();
//     const apiKey = config.GOOGLE_API_KEY;
//     if (!apiKey) throw new Error("GOOGLE_API_KEY not set. Open extension options to add it.");

//     const model = "gemma-4-31b-it";
//     const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

//     const res = await fetch(url, {
//         method:  "POST",
//         headers: { "Content-Type": "application/json" },
//         body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
//     });

//     if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);

//     const data = await res.json();
//     return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
// }

// // ── extractWithLLM (unchanged logic) ──
// async function extractWithLLM(chunks) {
//     const prompt = buildExtractionPrompt(chunks);
//     let rawText;
//     try {
//         rawText = await getResponseFromGemma(prompt);
//     } catch (e) {
//         console.error("Gemma failed:", e);
//         return {
//             goal: "Context recovery failed — original conversation unavailable",
//             decisions: [], currentState: "", codeBlocks: [], unresolvedQuestions: []
//         };
//     }

//     const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
//     try {
//         return JSON.parse(cleaned);
//     } catch {
//         return {
//             goal: "Context recovery failed — original conversation unavailable",
//             decisions: [], currentState: rawText.substring(0, 500),
//             codeBlocks: [], unresolvedQuestions: []
//         };
//     }
// }

// // ── Main entry point ──
// // Called from background.js with the raw messages array from content.js
// async function runExtractor(rawMessages) {
//     // Clear stores for this run
//     for (const k in codeStore)  delete codeStore[k];
//     for (const k in references) delete references[k];

//     const totalMessages = rawMessages.map(m => new Message(m.role, m.text, m.timestamp));
//     const chunks        = chunkConversation(totalMessages);
//     const scoredChunks  = scoreChunks(chunks);
//     const codeChunks    = extractCodeChunks(scoredChunks);

//     // Step 1: get metadata for code blocks (skip if none)
//     if (codeChunks.length > 0) {
//         const prompt      = buildCodePrompt(codeChunks);
//         const metaText    = await getResponseFromGemma(prompt);
//         const cleaned     = metaText.replace(/```json/g, "").replace(/```/g, "").trim();
//         const metadata    = JSON.parse(cleaned);

//         if (!Array.isArray(metadata) || metadata.length !== codeChunks.length) {
//             throw new Error(`Metadata length mismatch: got ${metadata.length}, expected ${codeChunks.length}`);
//         }

//         for (let i = 0; i < codeChunks.length; i++) {
//             const chunk = codeChunks[i];
//             const meta  = metadata[i];
//             const ref   = `code_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
//             codeStore[ref]          = new CodeBlock(meta.language, chunk.message.text, meta.description);
//             references[chunk.index] = new CodeReference(ref, meta.language, meta.description);
//         }
//     }

//     // Step 2: extract full context
//     const extractedContext      = await extractWithLLM(scoredChunks);
//     extractedContext.codeBlocks = {};

//     for (const [ref, block] of Object.entries(codeStore)) {
//         extractedContext.codeBlocks[ref] = {
//             language:    block.language,
//             code:        block.code,
//             description: block.description,
//         };
//     }

//     return extractedContext;
// }

// utils/llm_extractor.js
// Plain script for background.js (service worker).
// Depends on: modelTypes.js, chunker.js, scorer.js (loaded before this via importScripts)

// ── Stores ──
const codeStore  = {};
const references = {};

// ── UUID ──
function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// ── Config ──
async function getConfig() {
    return new Promise(resolve =>
        chrome.storage.sync.get(["GOOGLE_API_KEY", "OPEN_ROUTER_API_KEY"], resolve)
    );
}

// ────────────────────────────────────────────────────────────
// safeParseJSON
// Gemma often ignores "return JSON only" and wraps output in
// markdown, bullet points, or prose. This function tries every
// known recovery strategy before giving up.
// ────────────────────────────────────────────────────────────
function safeParseJSON(rawText, label) {
    console.log(`[${label}] Raw LLM output (${rawText.length} chars):`);
    console.log(rawText);

    // Strategy 1: strip ```json ... ``` fences and try directly
    let text = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

    try {
        const result = JSON.parse(text);
        console.log(`[${label}] ✓ Parsed after stripping fences`);
        return result;
    } catch (_) {}

    // Strategy 2: extract the first {...} or [...] block using a bracket scanner
    // This handles cases where the model adds prose before/after the JSON
    for (const [open, close] of [["[", "]"], ["{", "}"]]) {
        const start = text.indexOf(open);
        if (start === -1) continue;

        let depth  = 0;
        let end    = -1;
        let inStr  = false;
        let escape = false;

        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (escape)          { escape = false; continue; }
            if (ch === "\\")     { escape = true;  continue; }
            if (ch === '"')      { inStr = !inStr;  continue; }
            if (inStr)           continue;
            if (ch === open)     depth++;
            if (ch === close)    { depth--; if (depth === 0) { end = i; break; } }
        }

        if (end !== -1) {
            const candidate = text.slice(start, end + 1);
            try {
                const result = JSON.parse(candidate);
                console.log(`[${label}] ✓ Parsed via bracket scan (${open}...${close})`);
                return result;
            } catch (_) {}
        }
    }

    // Strategy 3: if the model returned a bullet list like:
    //   * Input: ...   * Output: ...
    // and we expected an array of {language, description} objects,
    // try to reconstruct it heuristically
    if (label === "codeMetadata") {
        const lines = rawText.split("\n").map(l => l.replace(/^[\*\-•]\s*/, "").trim()).filter(Boolean);
        const items = [];
        let current = {};
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.startsWith("language") || lower.startsWith("input")) {
                const val = line.split(/:(.+)/)[1]?.trim() ?? "unknown";
                current.language = val;
            } else if (lower.startsWith("description") || lower.startsWith("output")) {
                const val = line.split(/:(.+)/)[1]?.trim() ?? line;
                current.description = val;
                items.push({ language: current.language ?? "unknown", description: current.description });
                current = {};
            }
        }
        if (items.length > 0) {
            console.log(`[${label}] ✓ Reconstructed ${items.length} item(s) from bullet list`);
            return items;
        }
    }

    // All strategies failed — log the full text so you can see it in the service worker console
    console.error(`[${label}] ✗ All parse strategies failed. Full raw output logged above.`);
    return null;
}

// ── Prompt builders (logic unchanged) ──
function extractCodeChunks(chunks) {
    return chunks.filter(c =>
        c.type.toLowerCase() === "code" &&
        c.decision.toLowerCase() !== "drop"
    );
}

function buildCodePrompt(codeChunks) {
    const codeText = codeChunks.map((chunk, i) => `\nCODE ${i}\n\n${chunk.message.text}\n`);
    return [
        "You are a code analyser. Return ONLY a JSON array — no markdown, no prose, no bullet points.",
        "",
        "For each code snippet below output exactly one object with these two keys:",
        '  { "language": "<programming language>", "description": "<one sentence describing what it does>" }',
        "",
        "The full response must be a valid JSON array like:",
        '[{"language":"Python","description":"Sorts a list."}, ...]',
        "",
        "SNIPPETS:",
        codeText.join("\n-----------------\n"),
    ].join("\n");
}

function buildExtractionPrompt(chunks) {
    const filteredConvo = [];
    for (const chunk of chunks) {
        if (chunk.decision.toLowerCase() === "drop") continue;

        const prefix =
            chunk.decision.toLowerCase() === "compress" &&
            chunk.type.toLowerCase() === "code"
                ? "[SUMMARISE THIS]"
                : "[KEEP VERBATIM]";

        if (chunk.type.toLowerCase() === "code") {
            const ref = references[chunk.index];
            filteredConvo.push(
                `${chunk.message.role.toUpperCase()} [CODE]\nReference: ${ref.ref_id}\nLanguage: ${ref.language}\nSummary: ${ref.description}`
            );
        } else {
            filteredConvo.push(`${chunk.message.role.toUpperCase()} ${prefix}:\n${chunk.message.text}`);
        }
    }

    return [
        "You are a conversation memory compressor.",
        "Return ONLY valid JSON — no markdown, no prose, no bullet points.",
        "",
        "Extract structured context from the conversation below and return this exact shape:",
        '{"goal":"string","decisions":["string"],"currentState":"string","unresolvedQuestions":["string"]}',
        "",
        "Rules:",
        "- goal: one sentence max",
        "- decisions: things concluded or agreed",
        "- currentState: what was being worked on at the very end",
        "- unresolvedQuestions: things asked but not answered",
        "",
        "CONVERSATION:",
        filteredConvo.join("\n\n---\n\n"),
    ].join("\n");
}

// ── Gemini REST call ──
async function getResponseFromGemma(prompt) {
    const config = await getConfig();
    const apiKey = config.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY not set. Paste it in the extension popup and click Save Key.");

    const model = "gemma-4-31b-it"; // gemma-4-31b-it is not publicly available; using gemma-3-27b-it
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`[Gemini] Calling model: ${model}`);

    const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error("[Gemini] API error response:", errText);
        throw new Error(`Gemini API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    console.log("[Gemini] Full API response:", JSON.stringify(data, null, 2));

    const text = data.candidates?.[0]?.content?.parts?.[1]?.text ?? "";
    //  const cleanText = text
    //         .replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '') // Removes the thought tags and anything inside them
    //         .trim(); // Cleans trailing line breaks and spaces
    console.log("[Gemini] Extracted text:", text);
    return text;
}

// ── extractWithLLM ──
async function extractWithLLM(chunks) {
    const prompt = buildExtractionPrompt(chunks);
    let rawText;

    try {
        rawText = await getResponseFromGemma(prompt);
    } catch (e) {
        console.error("[extractWithLLM] Gemma call failed:", e);
        return {
            goal: "Context recovery failed — API call failed: " + e.message,
            decisions: [], currentState: "", codeBlocks: [], unresolvedQuestions: []
        };
    }
    return rawText;
    //const parsed = safeParseJSON(rawText, "extractContext");
    //if (parsed) return parsed;

    // Last resort: return the raw text so it at least surfaces in the UI
    return {
        goal: "Context recovery failed — LLM returned non-JSON",
        decisions: [],
        currentState: rawText.substring(0, 800),
        codeBlocks: [],
        unresolvedQuestions: ["Check service worker console for full LLM output"]
    };
}

// ── Main entry point ──
async function runExtractor(rawMessages) {
    console.log(`[runExtractor] Starting with ${rawMessages.length} messages`);

    // Clear stores
    for (const k in codeStore)  delete codeStore[k];
    for (const k in references) delete references[k];

    const totalMessages = rawMessages.map(m => new Message(m.role, m.text, m.timestamp));
    const chunks        = chunkConversation(totalMessages);
    const scoredChunks  = scoreChunks(chunks);
    const codeChunks    = extractCodeChunks(scoredChunks);

    console.log(`[runExtractor] Chunks: ${chunks.length} total, ${codeChunks.length} code`);

    // Step 1: code metadata
    if (codeChunks.length > 0) {
        const prompt   = buildCodePrompt(codeChunks);
        const metaText = await getResponseFromGemma(prompt);
        const metadata = safeParseJSON(metaText, "codeMetadata");

        if (!metadata || !Array.isArray(metadata)) {
            throw new Error(
                `Code metadata parse failed. The model returned non-JSON. ` +
                `Check the service worker console for the full raw output.`
            );
        }

        // If count mismatches, pad with fallback items rather than crashing
        while (metadata.length < codeChunks.length) {
            metadata.push({ language: "unknown", description: "Code block" });
        }

        for (let i = 0; i < codeChunks.length; i++) {
            const chunk = codeChunks[i];
            const meta  = metadata[i];
            const ref   = `code_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
            codeStore[ref]          = new CodeBlock(meta.language, chunk.message.text, meta.description);
            references[chunk.index] = new CodeReference(ref, meta.language, meta.description);
            console.log(`[runExtractor] Code block registered: ${ref} (${meta.language})`);
        }
    }

    // Step 2: full context extraction
    let extractedContext = await extractWithLLM(scoredChunks);
    console.log("extractedContext =", extractedContext);
    console.log("typeof extractedContext =", typeof extractedContext);
    console.log("Object.isFrozen(extractedContext) =", Object.isFrozen(extractedContext));
    console.log("extractedContext.codeBlocks =", extractedContext.codeBlocks);
    if(typeof extractedContext === "string") {
        extractedContext = JSON.parse(extractedContext);
    }
    extractedContext.codeBlocks = {};

    for (const [ref, block] of Object.entries(codeStore)) {
        extractedContext.codeBlocks[ref] = {
            language:    block.language,
            code:        block.code,
            description: block.description,
        };
    }

    console.log("[runExtractor] Done:", JSON.stringify(extractedContext, null, 2));
    return extractedContext;
}

// [runExtractor] Done: [
//   "Ground floor will be a 4-room rental unit with a common bathroom, kitchen, and veranda.",
//   "First floor will be a 3BHK luxury residence with attached bathrooms.",
//   "The building will be designed for G+3 capacity with a separate staircase for independent access."
// ]