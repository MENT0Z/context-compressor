import re
import tiktoken
from modelTypes import Message, ScoredChunk, ChunkType
from typing import List


# Same as GPT-4 / Claude tokenizer
enc = tiktoken.get_encoding("cl100k_base")


def detect_chunk_type(content: str) -> ChunkType:
    if not content or not content.strip():
        return ChunkType.INFO

    content_lower = content.lower()
    
    # Initialize scores. 
    # INFO starts at 0.5 to act as the default fallback if no other patterns match.
    scores = {
        ChunkType.CODE: 0.0,
        ChunkType.DECISION: 0.0,
        ChunkType.CORRECTION: 0.0,
        ChunkType.QUESTION: 0.0,
        ChunkType.INFO: 0.5 
    }

    # 1. Code Score (Looking for plain text syntax since markdown is gone)
    code_patterns = [
        # Python
        r"\bdef\s+\w+\(", r"\bimport\s+\w+", r"\bfrom\s+[\w.]+\s+import", r"@\w+",
        # C / C++
        r"#include\s+[<\"]", r"\bint\s+main\s*\(", r"\bstd::", r"\bprintf\s*\(", r"\bcout\s*<<",
        # Java / C#
        r"\bpublic\s+class\s+", r"\bpublic\s+static\s+void\s+main", r"\bsystem\.out\.println", r"\bconsole\.writeline", r"\bstring\s+\w+\s*=",
        # JavaScript / Web
        r"\bfunction\s*\w*\s*\(", r"\bconsole\.log\s*\(", r"\bconst\s+\w+\s*=", r"\blet\s+\w+\s*=", r"=>",
        # SQL
        r"\bselect\b.*\bfrom\b", r"\binsert\b.*\binto\b", r"\bupdate\b.*\bset\b",
        # General / Universal syntax
        r"\breturn\s+", r"\bclass\s+\w+", r"\w+\.\w+\(", r"=\s*\[", r"=\s*\{", r"\bif\s*\(", r"\bfor\s*\("
    ]
    for pattern in code_patterns:
        # 1 point for every code syntax match
        scores[ChunkType.CODE] += len(re.findall(pattern, content_lower))

    # 2. Decision Score
    decision_pattern = r"\b(decided|we'll go with|let's use|agreed|final answer|conclusion|so the plan is)\b"
    # 2 points per match (stronger signal)
    scores[ChunkType.DECISION] += len(re.findall(decision_pattern, content_lower)) * 2.0

    # 3. Correction Score
    correction_pattern = r"\b(actually|wait|that's wrong|correction|mistake|not quite|let me fix)\b"
    # 2 points per match
    scores[ChunkType.CORRECTION] += len(re.findall(correction_pattern, content_lower)) * 2.0

    # 4. Question Score
    question_pattern = r"\b(how do|what is|why does|can you|could you)\b"
    # 1.5 points per keyword match
    scores[ChunkType.QUESTION] += len(re.findall(question_pattern, content_lower)) * 1.5
    # 1.5 points per question mark
    scores[ChunkType.QUESTION] += content.count("?") * 1.5

    # 5. Info Score (Explicit patterns for conversational info & updates)
    info_pattern = r"\b(hello|hi|hey|thanks|thank you|fyi|for your information|just a note|note that|update|status|here is|wanted to share|as per|according to|documentation|readme)\b"
    # 1.5 points per conversational keyword match added on top of the 0.5 baseline
    scores[ChunkType.INFO] += len(re.findall(info_pattern, content_lower)) * 1.5

    # Find and return the ChunkType with the highest score
    best_match = max(scores, key=scores.get)
    # print(scores)  # Debugging: print the scores for each chunk type
    return best_match


def chunk_conversation(messages: List[Message]) -> List[ScoredChunk]:
    chunks = []

    for index, msg in enumerate(messages):
        tokens = enc.encode(msg.text)

        chunk_type = detect_chunk_type(msg.text)

        chunks.append(
            ScoredChunk(
                message=msg,
                index=index,
                type=chunk_type,
                tokenCount=len(tokens),
                score=0.0,          # filled by scorer
                decision="keep"     # filled by scorer
            )
        )

    return chunks


# if __name__ == "__main__":
#     with open(r"D:\context_compression\demoChat.json", "r", encoding="utf-8") as f:
#         data = json.load(f)
    
#     totalMessages = [(Message(message["role"], message["text"], message["timestamp"])) for message in data["messages"]]
#     chunks = chunk_conversation(totalMessages)
#     for chunk in chunks:
#         print(chunk.type,"\n")