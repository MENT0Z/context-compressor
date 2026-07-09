// chunker.js

import { getEncoding } from "js-tiktoken";
import {
    Message,
    ScoredChunk,
    ChunkType
} from "./modelTypes.js";

// Same as GPT-4 / Claude tokenizer
const enc = getEncoding("cl100k_base");

export function detectChunkType(content) {
    if (!content || !content.trim()) {
        return ChunkType.INFO;
    }

    const contentLower = content.toLowerCase();

    // Initialize scores.
    // INFO starts at 0.5 to act as the default fallback if no other patterns match.
    const scores = {
        [ChunkType.CODE]: 0.0,
        [ChunkType.DECISION]: 0.0,
        [ChunkType.CORRECTION]: 0.0,
        [ChunkType.QUESTION]: 0.0,
        [ChunkType.INFO]: 0.5,
    };

    // 1. Code Score (Looking for plain text syntax since markdown is gone)
    const codePatterns = [
        // Python
        /\bdef\s+\w+\(/g,
        /\bimport\s+\w+/g,
        /\bfrom\s+[\w.]+\s+import/g,
        /@\w+/g,

        // C / C++
        /#include\s+[<"]/g,
        /\bint\s+main\s*\(/g,
        /\bstd::/g,
        /\bprintf\s*\(/g,
        /\bcout\s*<</g,

        // Java / C#
        /\bpublic\s+class\s+/g,
        /\bpublic\s+static\s+void\s+main/g,
        /\bsystem\.out\.println/g,
        /\bconsole\.writeline/g,
        /\bstring\s+\w+\s*=/g,

        // JavaScript / Web
        /\bfunction\s*\w*\s*\(/g,
        /\bconsole\.log\s*\(/g,
        /\bconst\s+\w+\s*=/g,
        /\blet\s+\w+\s*=/g,
        /=>/g,

        // SQL
        /\bselect\b.*\bfrom\b/g,
        /\binsert\b.*\binto\b/g,
        /\bupdate\b.*\bset\b/g,

        // General / Universal syntax
        /\breturn\s+/g,
        /\bclass\s+\w+/g,
        /\w+\.\w+\(/g,
        /=\s*\[/g,
        /=\s*\{/g,
        /\bif\s*\(/g,
        /\bfor\s*\(/g,
    ];

    for (const pattern of codePatterns) {
        const matches = contentLower.match(pattern);
        scores[ChunkType.CODE] += matches ? matches.length : 0;
    }

    // 2. Decision Score
    const decisionPattern =
        /\b(decided|we'll go with|let's use|agreed|final answer|conclusion|so the plan is)\b/g;

    const decisionMatches = contentLower.match(decisionPattern);
    scores[ChunkType.DECISION] +=
        (decisionMatches ? decisionMatches.length : 0) * 2.0;

    // 3. Correction Score
    const correctionPattern =
        /\b(actually|wait|that's wrong|correction|mistake|not quite|let me fix)\b/g;

    const correctionMatches = contentLower.match(correctionPattern);
    scores[ChunkType.CORRECTION] +=
        (correctionMatches ? correctionMatches.length : 0) * 2.0;

    // 4. Question Score
    const questionPattern =
        /\b(how do|what is|why does|can you|could you)\b/g;

    const questionMatches = contentLower.match(questionPattern);

    scores[ChunkType.QUESTION] +=
        (questionMatches ? questionMatches.length : 0) * 1.5;

    scores[ChunkType.QUESTION] +=
        (content.match(/\?/g) || []).length * 1.5;

    // 5. Info Score
    const infoPattern =
        /\b(hello|hi|hey|thanks|thank you|fyi|for your information|just a note|note that|update|status|here is|wanted to share|as per|according to|documentation|readme)\b/g;

    const infoMatches = contentLower.match(infoPattern);

    scores[ChunkType.INFO] +=
        (infoMatches ? infoMatches.length : 0) * 1.5;

    // Find and return the ChunkType with the highest score
    let bestMatch = ChunkType.INFO;
    let bestScore = -Infinity;

    for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestMatch = type;
        }
    }

    return bestMatch;
}

export function chunkConversation(messages) {
    const chunks = [];

    messages.forEach((msg, index) => {
        const tokens = enc.encode(msg.text);

        const chunkType = detectChunkType(msg.text);

        chunks.push(
            new ScoredChunk(
                msg,
                index,
                chunkType,
                tokens.length,
                0.0,       // filled by scorer
                "keep"     // filled by scorer
            )
        );
    });

    return chunks;
}

/*
// Example Usage

import fs from "fs";

const data = JSON.parse(
    fs.readFileSync("./demoChat.json", "utf8")
);

const totalMessages = data.messages.map(
    m => new Message(
        m.role,
        m.text,
        m.timestamp
    )
);

const chunks = chunkConversation(totalMessages);

for (const chunk of chunks) {
    console.log(chunk.type);
}
*/