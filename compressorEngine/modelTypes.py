from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import json
from typing import Optional, List


# Every message from any LLM gets normalized to this
@dataclass
class Message:
    role: str  # "user" | "assistant"
    text: str
    timestamp: Optional[int] = None


# After the chunker tags each message
class ChunkType(Enum):
    CODE = "code"
    DECISION = "decision"
    QUESTION = "question"
    INFO = "info"
    CORRECTION = "correction"


@dataclass
class ScoredChunk:
    message: Message
    index: int                 # original position in conversation
    type: ChunkType
    tokenCount: int
    score: float               # 0–1, higher = more important to keep
    decision: str              # "keep" | "compress" | "drop"


@dataclass
class CodeBlock:
    language: str
    code: str                  # always verbatim, never summarised
    description: str            # one line: what this code does

@dataclass
class CodeReference:
    ref_id: str
    language: str
    description: str
    
# The final structured output stored in your DB
@dataclass
class ConversationSnapshot:
    id: str
    sessionId: str
    createdAt: datetime

    # Structured fields (what the LLM extracts)
    goal: str
    decisions: List[str]
    currentState: str
    codeBlocks: List[CodeBlock] = field(default_factory=list)
    unresolvedQuestions: List[str] = field(default_factory=list)

    # Metadata
    totalTokensOriginal: int = 0
    totalTokensCompressed: int = 0
    compressionRatio: float = 0.0
    sourcePlatform: str = ""   # "chatgpt" | "claude" | "gemini"

    # 1536-dim vector for semantic search
    embedding: List[float] = field(default_factory=list)


