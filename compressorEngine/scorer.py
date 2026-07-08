import json
from typing import Dict, List
from modelTypes import ChunkType, ScoredChunk
import re


TYPE_WEIGHTS: Dict[ChunkType, float] = {
    ChunkType.CODE: 0.95,          # code is almost always critical
    ChunkType.DECISION: 0.90,      # decisions define the path taken
    ChunkType.CORRECTION: 0.85,    # corrections invalidate earlier info
    ChunkType.QUESTION: 0.40,      # questions alone are low value
    ChunkType.INFO: 0.50,
}


# Keywords that signal a chunk is load-bearing
HIGH_VALUE_KEYWORDS = [
    "error", "bug", "fix", "issue", "problem",
    "architecture", "schema", "design", "structure",
    "final", "done", "completed", "working",
    "requirement", "must", "should", "need to",
    "api", "endpoint", "database", "auth",
]


def keyword_score(content: str) -> float:
    lower = content.lower()

    hits = sum(
        1 for kw in HIGH_VALUE_KEYWORDS
        if kw in lower
    )

    return min(hits / 3, 1.0)


def recency_score(index: int, total: int) -> float:
    """
    Last 20% of conversation gets full recency score
    First 20% gets 0.3
    Middle gets linear interpolation
    """

    position = index / total

    if position >= 0.8:
        return 1.0

    if position <= 0.2:
        return 0.3

    return 0.3 + ((position - 0.2) / 0.6) * 0.7


def cross_reference_score(
    chunk: ScoredChunk,
    all_chunks: List[ScoredChunk]
) -> float:
    """
    Does later content reference this message?
    """

    this_words = set(
        word
        for word in re.split(r"\W+", chunk.message.text.lower())
        if len(word) > 4
    )

    references = 0

    for i in range(chunk.index + 1, len(all_chunks)):

        later_words = re.split(
            r"\W+",
            all_chunks[i].message.text.lower()
        )

        overlap = sum(
            1 for word in later_words
            if word in this_words
        )

        if overlap >= 2:
            references += 1

    return min(references / 3, 1.0)


def score_chunks(
    chunks: List[ScoredChunk]
) -> List[ScoredChunk]:

    total = len(chunks)

    scored_chunks = []

    for chunk in chunks:

        recency = recency_score(
            chunk.index,
            total
        )

        type_weight = TYPE_WEIGHTS[chunk.type]

        keyword = keyword_score(
            chunk.message.text
        )

        cross_ref = cross_reference_score(
            chunk,
            chunks
        )

        # Weighted blend
        score = (
            recency * 0.35 +
            type_weight * 0.30 +
            keyword * 0.20 +
            cross_ref * 0.15
        )

        # Decision thresholds
        if score >= 0.65 or chunk.type == ChunkType.CODE:
            decision = "keep"

        elif score >= 0.35:
            decision = "compress"

        else:
            decision = "drop"


        scored_chunks.append(
            ScoredChunk(
                message=chunk.message,
                index=chunk.index,
                type=chunk.type,
                tokenCount=chunk.tokenCount,
                score=score,
                decision=decision
            )
        )

    return scored_chunks

# if __name__ == "__main__":
#     from chunker import chunk_conversation
#     from modelTypes import Message

#     with open(r"D:\context_compression\demoChat.json", "r", encoding="utf-8") as f:
#         data = json.load(f)
    
#     totalMessages = [(Message(message["role"], message["text"], message["timestamp"])) for message in data["messages"]]
#     chunks = chunk_conversation(totalMessages)
#     scored_chunks = score_chunks(chunks)

#     for chunk in scored_chunks:
#         print(f"Index: {chunk.index}, Type: {chunk.type}, Score: {chunk.score:.2f}, Decision: {chunk.decision}")