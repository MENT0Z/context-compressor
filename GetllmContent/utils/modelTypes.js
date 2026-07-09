// modelTypes.js

// Every message from any LLM gets normalized to this
export class Message {
    constructor(role, text, timestamp = null) {
        this.role = role;               // "user" | "assistant"
        this.text = text;
        this.timestamp = timestamp;
    }
}

// After the chunker tags each message
export const ChunkType = Object.freeze({
    CODE: "code",
    DECISION: "decision",
    QUESTION: "question",
    INFO: "info",
    CORRECTION: "correction",
});

export class ScoredChunk {
    constructor(
        message,
        index,
        type,
        tokenCount,
        score,
        decision
    ) {
        this.message = message;
        this.index = index;             // original position in conversation
        this.type = type;
        this.tokenCount = tokenCount;
        this.score = score;             // 0–1, higher = more important to keep
        this.decision = decision;       // "keep" | "compress" | "drop"
    }
}

export class CodeBlock {
    constructor(language, code, description) {
        this.language = language;
        this.code = code;               // always verbatim, never summarised
        this.description = description; // one line: what this code does
    }
}

export class CodeReference {
    constructor(ref_id, language, description) {
        this.ref_id = ref_id;
        this.language = language;
        this.description = description;
    }
}

// The final structured output stored in your DB
export class ConversationSnapshot {
    constructor({
        id,
        sessionId,
        createdAt,

        goal,
        decisions,

        currentState,

        codeBlocks = [],
        unresolvedQuestions = [],

        totalTokensOriginal = 0,
        totalTokensCompressed = 0,
        compressionRatio = 0.0,

        sourcePlatform = "",

        embedding = [],
    }) {
        this.id = id;
        this.sessionId = sessionId;
        this.createdAt = createdAt instanceof Date
            ? createdAt
            : new Date(createdAt);

        // Structured fields (what the LLM extracts)
        this.goal = goal;
        this.decisions = decisions;
        this.currentState = currentState;
        this.codeBlocks = codeBlocks;
        this.unresolvedQuestions = unresolvedQuestions;

        // Metadata
        this.totalTokensOriginal = totalTokensOriginal;
        this.totalTokensCompressed = totalTokensCompressed;
        this.compressionRatio = compressionRatio;
        this.sourcePlatform = sourcePlatform;

        // 1536-dim vector for semantic search
        this.embedding = embedding;
    }
}