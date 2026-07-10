const TYPE_WEIGHTS = {
    [ChunkType.CODE]:       0.95,
    [ChunkType.DECISION]:   0.90,
    [ChunkType.CORRECTION]: 0.85,
    [ChunkType.QUESTION]:   0.40,
    [ChunkType.INFO]:       0.50,
};

const HIGH_VALUE_KEYWORDS = [
    "error","bug","fix","issue","problem","architecture","schema","design",
    "structure","final","done","completed","working","requirement","must",
    "should","need to","api","endpoint","database","auth",
];

function keywordScore(content) {
    const lower = content.toLowerCase();
    let hits = 0;
    for (const kw of HIGH_VALUE_KEYWORDS) {
        if (lower.includes(kw)) hits++;
    }
    return Math.min(hits / 3, 1.0);
}

function recencyScore(index, total) {
    const position = index / total;
    if (position >= 0.8) return 1.0;
    if (position <= 0.2) return 0.3;
    return 0.3 + ((position - 0.2) / 0.6) * 0.7;
}

function crossReferenceScore(chunk, allChunks) {
    const thisWords = new Set(
        chunk.message.text.toLowerCase().split(/\W+/).filter(w => w.length > 4)
    );
    let references = 0;
    for (let i = chunk.index + 1; i < allChunks.length; i++) {
        const laterWords = allChunks[i].message.text.toLowerCase().split(/\W+/);
        let overlap = 0;
        for (const word of laterWords) { if (thisWords.has(word)) overlap++; }
        if (overlap >= 2) references++;
    }
    return Math.min(references / 3, 1.0);
}

function scoreChunks(chunks) {
    const total = chunks.length;
    return chunks.map(chunk => {
        const recency    = recencyScore(chunk.index, total);
        const typeWeight = TYPE_WEIGHTS[chunk.type];
        const keyword    = keywordScore(chunk.message.text);
        const crossRef   = crossReferenceScore(chunk, chunks);

        const score =
            recency    * 0.35 +
            typeWeight * 0.30 +
            keyword    * 0.20 +
            crossRef   * 0.15;

        let decision;
        if (score >= 0.65 || chunk.type === ChunkType.CODE) decision = "keep";
        else if (score >= 0.35) decision = "compress";
        else decision = "drop";

        return new ScoredChunk(
            chunk.message, chunk.index, chunk.type,
            chunk.tokenCount, score, decision
        );
    });
}