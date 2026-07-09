// extractor.js

import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

import { scoreChunks } from "./scorer.js";
import {
    ChunkType,
    CodeBlock,
    CodeReference,
    Message
} from "./modelTypes.js";
import { chunkConversation } from "./chunker.js";

dotenv.config();

export const codeStore = {};
export const references = {};

export function extractCodeChunks(chunks) {
    return chunks.filter(
        chunk =>
            chunk.type.toLowerCase() === "code" &&
            chunk.decision.toLowerCase() !== "drop"
    );
}

export function buildCodePrompt(codeChunks) {

    const codeText = [];

    codeChunks.forEach((chunk, i) => {

        codeText.push(`
CODE ${i}

${chunk.message.text}
`);
    });

    return `
You are analysing code snippets.

For each snippet return

[
{
"language":"string — programming language used",
"description":"describe in one line what this code does"
}
]

Rules

- one sentence only
- identify language
- no markdown
- valid json only

Snippets

${codeText.join("\n\n-----------------\n")}
`;
}

export function buildExtractionPrompt(chunks) {

    const filteredConvo = [];

    for (const chunk of chunks) {

        if (chunk.decision.toLowerCase() === "drop") {
            continue;
        }

        const prefix =
            chunk.decision.toLowerCase() === "compress" &&
            chunk.type.toLowerCase() === "code"
                ? "[SUMMARISE THIS]"
                : "[KEEP VERBATIM]";

        if (chunk.type.toLowerCase() === "code") {

            const ref = references[chunk.index];

            filteredConvo.push(`
${chunk.message.role.toUpperCase()} [CODE]

Reference: ${ref.ref_id}

Language:
${ref.language}

Summary:
${ref.description}

whenever you need to cite this code use the refno.
`);
        }
        else {

            filteredConvo.push(
`${chunk.message.role.toUpperCase()} ${prefix}:
${chunk.message.text}`
            );
        }
    }

    return `
You are a conversation memory compressor.

Extract structured context from this filtered conversation.

CONVERSATION:

${filteredConvo.join("\n\n---\n\n")}

OUTPUT RULES:

- Respond ONLY with valid JSON matching the schema below
- For blocks marked [KEEP VERBATIM]: include them EXACTLY as written
- For sections marked [SUMMARISE THIS]: condense to the essential point only
- Be ruthlessly concise — every word costs tokens
- goal: one sentence max
- decisions: bullet points of things concluded/agreed
- currentState: what was being worked on at the very end
- unresolvedQuestions: things asked but not answered

JSON SCHEMA:

{
"goal":"string",
"decisions":["string"],
"currentState":"string",
"unresolvedQuestions":["string"]
}

Respond with JSON only.
`;
}

export async function getResponseFromGemma(prompt) {

    const client = new GoogleGenAI({
        apiKey: process.env.GOOGLE_API_KEY
    });
    // console.log(process.env.GOOGLE_API_KEY);
    const response = await client.models.generateContent({
        model: "gemma-4-31b-it",
        contents: prompt
    });

    return response.text;
}

// If you want to use OpenRouter instead
export async function getResponseFromOpenRouter(prompt) {

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openrouter/free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 1500
            })
        }
    );

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();

    return data.choices[0].message.content;
}

export async function extractWithLLM(chunks) {

    const prompt = buildExtractionPrompt(chunks);

    let rawText;

    try {

        rawText = await getResponseFromGemma(prompt);

    } catch (e) {

        console.log("Gemma failed:", e);

        return {
            goal: "Context recovery failed — original conversation unavailable",
            decisions: [],
            currentState: "",
            codeBlocks: [],
            unresolvedQuestions: []
        };
    }

    console.log("LLM raw output type:", typeof rawText);
    console.log(rawText);

    const cleaned = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    try {

        return JSON.parse(cleaned);

    } catch (err) {

        console.log("LLM returned invalid JSON");

        return {
            goal: "Context recovery failed — original conversation unavailable",
            decisions: [],
            currentState: rawText.substring(0, 500),
            codeBlocks: [],
            unresolvedQuestions: []
        };
    }
}

// ------------------------------
// main()
// ------------------------------

async function main() {

    const data = JSON.parse(
        fs.readFileSync("D:\\context_compression\\demoChat.json", "utf8")
    );

    const totalMessages = data.messages.map(
        message =>
            new Message(
                message.role,
                message.text,
                message.timestamp
            )
    );

    const chunks = chunkConversation(totalMessages);

    const scoredChunks = scoreChunks(chunks);

    const codeChunks = extractCodeChunks(scoredChunks);

    const prompt = buildCodePrompt(codeChunks);

    // const metadataText = await getResponseFromOpenRouter(prompt);

    const metadataText = await getResponseFromGemma(prompt);

    console.log("=================================");
    console.log(metadataText);
    console.log("=================================");

    const metadata = JSON.parse(metadataText);

    if (!Array.isArray(metadata)) {
        throw new Error(
            `Expected array but got ${typeof metadata}`
        );
    }

    if (metadata.length !== codeChunks.length) {
        throw new Error(
            `Expected ${codeChunks.length} metadata items but got ${metadata.length}`
        );
    }

    for (let i = 0; i < codeChunks.length; i++) {

        const chunk = codeChunks[i];
        const meta = metadata[i];

        const ref = `code_${uuidv4().replace(/-/g, "").substring(0, 8)}`;

        codeStore[ref] = new CodeBlock(
            meta.language,
            chunk.message.text,
            meta.description
        );

        references[chunk.index] = new CodeReference(
            ref,
            meta.language,
            meta.description
        );
    }

    const extractedContext = await extractWithLLM(scoredChunks);

    console.log(extractedContext);

    extractedContext.codeBlocks = {};

    for (const [ref, block] of Object.entries(codeStore)) {

        extractedContext.codeBlocks[ref] = {
            language: block.language,
            code: block.code,
            description: block.description
        };
    }

    console.log("=================================");
    console.log("=================================");

    console.log(
        JSON.stringify(
            extractedContext,
            null,
            2
        )
    );
}

// ------------------------------
// Run
// ------------------------------

main().catch(err => {
    console.error(err);
});