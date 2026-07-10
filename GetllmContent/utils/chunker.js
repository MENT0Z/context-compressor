function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

function detectChunkType(content) {
    if (!content || !content.trim()) return ChunkType.INFO;

    const contentLower = content.toLowerCase();

    const scores = {
        [ChunkType.CODE]:       0.0,
        [ChunkType.DECISION]:   0.0,
        [ChunkType.CORRECTION]: 0.0,
        [ChunkType.QUESTION]:   0.0,
        [ChunkType.INFO]:       0.5,
    };

    const codePatterns = [
        /\bdef\s+\w+\(/g, /\bimport\s+\w+/g, /\bfrom\s+[\w.]+\s+import/g, /@\w+/g,
        /#include\s+[<"]/g, /\bint\s+main\s*\(/g, /\bstd::/g, /\bprintf\s*\(/g, /\bcout\s*<</g,
        /\bpublic\s+class\s+/g, /\bpublic\s+static\s+void\s+main/g,
        /\bsystem\.out\.println/g, /\bconsole\.writeline/g, /\bstring\s+\w+\s*=/g,
        /\bfunction\s*\w*\s*\(/g, /\bconsole\.log\s*\(/g,
        /\bconst\s+\w+\s*=/g, /\blet\s+\w+\s*=/g, /=>/g,
        /\bselect\b.*\bfrom\b/g, /\binsert\b.*\binto\b/g, /\bupdate\b.*\bset\b/g,
        /\breturn\s+/g, /\bclass\s+\w+/g, /\w+\.\w+\(/g,
        /=\s*\[/g, /=\s*\{/g, /\bif\s*\(/g, /\bfor\s*\(/g,
    ];

    for (const pattern of codePatterns) {
        const matches = contentLower.match(pattern);
        scores[ChunkType.CODE] += matches ? matches.length : 0;
    }

    const decisionMatches = contentLower.match(/\b(decided|we'll go with|let's use|agreed|final answer|conclusion|so the plan is)\b/g);
    scores[ChunkType.DECISION] += (decisionMatches ? decisionMatches.length : 0) * 2.0;

    const correctionMatches = contentLower.match(/\b(actually|wait|that's wrong|correction|mistake|not quite|let me fix)\b/g);
    scores[ChunkType.CORRECTION] += (correctionMatches ? correctionMatches.length : 0) * 2.0;

    const questionMatches = contentLower.match(/\b(how do|what is|why does|can you|could you)\b/g);
    scores[ChunkType.QUESTION] += (questionMatches ? questionMatches.length : 0) * 1.5;
    scores[ChunkType.QUESTION] += (content.match(/\?/g) || []).length * 1.5;

    const infoMatches = contentLower.match(/\b(hello|hi|hey|thanks|thank you|fyi|for your information|just a note|note that|update|status|here is|wanted to share|as per|according to|documentation|readme)\b/g);
    scores[ChunkType.INFO] += (infoMatches ? infoMatches.length : 0) * 1.5;

    let bestMatch = ChunkType.INFO;
    let bestScore = -Infinity;
    for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) { bestScore = score; bestMatch = type; }
    }
    return bestMatch;
}

function chunkConversation(messages) {
    const chunks = [];
    messages.forEach((msg, index) => {
        chunks.push(new ScoredChunk(
            msg, index,
            detectChunkType(msg.text),
            estimateTokens(msg.text),
            0.0,
            "keep"
        ));
    });
    return chunks;
}