// scorer.js

import { ChunkType, ScoredChunk } from "./modelTypes.js";

const TYPE_WEIGHTS = {
    [ChunkType.CODE]: 0.95,         // code is almost always critical
    [ChunkType.DECISION]: 0.90,     // decisions define the path taken
    [ChunkType.CORRECTION]: 0.85,   // corrections invalidate earlier info
    [ChunkType.QUESTION]: 0.40,     // questions alone are low value
    [ChunkType.INFO]: 0.50,
};

// Keywords that signal a chunk is load-bearing
const HIGH_VALUE_KEYWORDS = [
    "error",
    "bug",
    "fix",
    "issue",
    "problem",
    "architecture",
    "schema",
    "design",
    "structure",
    "final",
    "done",
    "completed",
    "working",
    "requirement",
    "must",
    "should",
    "need to",
    "api",
    "endpoint",
    "database",
    "auth",
];

export function keywordScore(content) {
    const lower = content.toLowerCase();

    let hits = 0;

    for (const keyword of HIGH_VALUE_KEYWORDS) {
        if (lower.includes(keyword)) {
            hits++;
        }
    }

    return Math.min(hits / 3, 1.0);
}

export function recencyScore(index, total) {
    /*
        Last 20% of conversation gets full recency score
        First 20% gets 0.3
        Middle gets linear interpolation
    */

    const position = index / total;

    if (position >= 0.8) {
        return 1.0;
    }

    if (position <= 0.2) {
        return 0.3;
    }

    return 0.3 + ((position - 0.2) / 0.6) * 0.7;
}

export function crossReferenceScore(chunk, allChunks) {
    /*
        Does later content reference this message?
    */

    const thisWords = new Set(
        chunk.message.text
            .toLowerCase()
            .split(/\W+/)
            .filter(word => word.length > 4)
    );

    let references = 0;

    for (let i = chunk.index + 1; i < allChunks.length; i++) {

        const laterWords = allChunks[i].message.text
            .toLowerCase()
            .split(/\W+/);

        let overlap = 0;

        for (const word of laterWords) {
            if (thisWords.has(word)) {
                overlap++;
            }
        }

        if (overlap >= 2) {
            references++;
        }
    }

    return Math.min(references / 3, 1.0);
}

export function scoreChunks(chunks) {

    const total = chunks.length;

    const scoredChunks = [];

    for (const chunk of chunks) {

        const recency = recencyScore(
            chunk.index,
            total
        );

        const typeWeight = TYPE_WEIGHTS[chunk.type];

        const keyword = keywordScore(
            chunk.message.text
        );

        const crossRef = crossReferenceScore(
            chunk,
            chunks
        );

        // Weighted blend
        const score =
            recency * 0.35 +
            typeWeight * 0.30 +
            keyword * 0.20 +
            crossRef * 0.15;

        let decision;

        // Decision thresholds
        if (
            score >= 0.65 ||
            chunk.type === ChunkType.CODE
        ) {
            decision = "keep";
        }
        else if (score >= 0.35) {
            decision = "compress";
        }
        else {
            decision = "drop";
        }

        scoredChunks.push(
            new ScoredChunk(
                chunk.message,
                chunk.index,
                chunk.type,
                chunk.tokenCount,
                score,
                decision
            )
        );
    }

    return scoredChunks;
}

/*
Example Usage

import fs from "fs";
import { Message } from "./modelTypes.js";
import { chunkConversation } from "./chunker.js";

const data = JSON.parse(
    fs.readFileSync("./demoChat.json", "utf8")
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

for (const chunk of scoredChunks) {
    console.log(
        `Index: ${chunk.index}, Type: ${chunk.type}, Score: ${chunk.score.toFixed(2)}, Decision: ${chunk.decision}`
    );
}
*/