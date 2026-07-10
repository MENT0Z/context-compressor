class Message {
    constructor(role, text, timestamp = null) {
        this.role      = role;
        this.text      = text;
        this.timestamp = timestamp;
    }
}

const ChunkType = Object.freeze({
    CODE:       "code",
    DECISION:   "decision",
    QUESTION:   "question",
    INFO:       "info",
    CORRECTION: "correction",
});

class ScoredChunk {
    constructor(message, index, type, tokenCount, score, decision) {
        this.message    = message;
        this.index      = index;
        this.type       = type;
        this.tokenCount = tokenCount;
        this.score      = score;
        this.decision   = decision;
    }
}

class CodeBlock {
    constructor(language, code, description) {
        this.language    = language;
        this.code        = code;
        this.description = description;
    }
}

class CodeReference {
    constructor(ref_id, language, description) {
        this.ref_id      = ref_id;
        this.language    = language;
        this.description = description;
    }
}