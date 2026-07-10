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