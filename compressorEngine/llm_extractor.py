from dataclasses import asdict
import os
import json
from uuid import uuid4
import requests
from typing import List, Dict, Any
from scorer import score_chunks
from modelTypes import ScoredChunk , CodeBlock,CodeReference
from dotenv import load_dotenv

load_dotenv()

code_store = {}

references = {}

def extract_code_chunks(chunks: List[ScoredChunk]):
    return [
        chunk
        for chunk in chunks
        if chunk.type.value.lower() == "code"
        and chunk.decision.lower() != "drop"
    ]


def build_code_prompt(code_chunks):

    code_text = []

    for i, chunk in enumerate(code_chunks):

        code_text.append(
            f"""
            CODE {i}

            {chunk.message.text}
            """
            )

    code_text = "\n\n-----------------\n".join(code_text)

    return f"""
            You are analysing code snippets.

            For each snippet return

            [
            {{
                "language":"string — programming language used",
                "description":"describe in one line what this code does",
            }}
            ]

            Rules

            - one sentence only
            - identify language
            - no markdown
            - valid json only

            Snippets

            {code_text}
            """

def build_extraction_prompt(chunks: List[ScoredChunk]) -> str:
    """
    Reconstruct filtered conversation from scored chunks
    """

    filtered_convo = []

    for chunk in chunks:
        if chunk.decision.lower() == "drop":
            continue
        
        prefix = (
            "[SUMMARISE THIS]"
            if chunk.decision.lower() == "compress" and chunk.type.value.lower()=="code"
            else "[KEEP VERBATIM]"
        )
        if(chunk.type.value.lower()=="code"):
            ref = references[chunk.index]
            filtered_convo.append(
                f"""{chunk.message.role.upper()} [CODE]

                Reference: {ref.ref_id}
                
                Language:
                {ref.language}
                
                Summary:
                {ref.description}
                whenever you need to cite this code use the refno.
                """
            )
        else:
            filtered_convo.append(
            f"{chunk.message.role.upper()} {prefix}:\n"
            f"{chunk.message.text}"
            )

    filtered_convo = "\n\n---\n\n".join(filtered_convo)


    return f"""
You are a conversation memory compressor. Extract structured context from this filtered conversation.

CONVERSATION:
{filtered_convo}

OUTPUT RULES:
- Respond ONLY with valid JSON matching the schema below
- For blocks marked [KEEP VERBATIM]: include them EXACTLY as written, character for character
- For sections marked [SUMMARISE THIS]: condense to the essential point only
- Be ruthlessly concise — every word costs tokens
- goal: one sentence max
- decisions: bullet points of things concluded/agreed, present tense
- currentState: what was being worked on at the very end
- unresolvedQuestions: things that were asked but not answered, or left TODO

JSON SCHEMA:
{{
  "goal": "string — what the user was trying to accomplish",
  "decisions": ["string", "..."],
  "currentState": "string — last known state / progress",
  "unresolvedQuestions": ["string", "..."]
}}

Respond with JSON only. No preamble, no markdown fences.
"""

def get_response_from_gemma(prompt: str) -> str:
    from google import genai
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
    response = client.models.generate_content(
    model="gemma-4-31b-it",  # You can also use "gemma-4-26b-a4b-it" or older variants
    contents=prompt,
    )
    return response.text
    



def get_response_from_open_router(prompt: str) -> str:

    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",

        headers={
            "Authorization": f"Bearer {os.getenv('OPEN_ROUTER_API_KEY')}",
            "Content-Type": "application/json"
        },

        data=json.dumps({
            "model": "openrouter/free",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 1500
        })
    )


    response.raise_for_status()

    data = response.json()

    return (
        data["choices"][0]
        ["message"]
        ["content"]
    )



def extract_with_llm(
    chunks: List[ScoredChunk]
) -> Dict[str, Any]:

    prompt = build_extraction_prompt(chunks)


    try:
        raw_text = get_response_from_gemma(prompt)

    except Exception as e:

        print("OpenRouter failed:", e)

        return {
            "goal": "Context recovery failed — original conversation unavailable",
            "decisions": [],
            "currentState": "",
            "codeBlocks": [],
            "unresolvedQuestions": []
        }

    print("LLM raw output type:", type(raw_text))  # Debugging: print the type of the LLM output
    print("LLM raw output:", raw_text)  # Debugging: print the first 200 characters of the LLM output
    # Remove accidental markdown fences
    cleaned = (
        raw_text
        .replace("```json", "")
        .replace("```", "")
        .strip()
    )


    try:
        return json.loads(cleaned)


    except json.JSONDecodeError:

        print(
            "LLM returned non-JSON:",
            raw_text[:200]
        )

        return {
            "goal": "Context recovery failed — original conversation unavailable",
            "decisions": [],
            "currentState": raw_text[:500],
            "codeBlocks": [],
            "unresolvedQuestions": []
        }
    

if __name__ == "__main__":
    from chunker import chunk_conversation
    from modelTypes import Message

    with open(r"D:\context_compression\demoChat.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    totalMessages = [(Message(message["role"], message["text"], message["timestamp"])) for message in data["messages"]]
    chunks = chunk_conversation(totalMessages)
    scored_chunks = score_chunks(chunks)
    code_chunks = extract_code_chunks(scored_chunks)
    prompt = build_code_prompt(code_chunks)
    #metadata = get_response_from_open_router(prompt)
    metadata = get_response_from_gemma(prompt)
    print("===================================")
    print(metadata)
    print("===================================")

    # Convert JSON string -> Python list of dictionaries
    metadata = json.loads(metadata)

    # Optional sanity check
    if not isinstance(metadata, list):
        raise TypeError(f"Expected a list, got {type(metadata)}")

    if len(metadata) != len(code_chunks):
        raise ValueError(
            f"Expected {len(code_chunks)} metadata items, got {len(metadata)}"
        )

    for chunk, meta in zip(code_chunks, metadata):
        ref = f"code_{uuid4().hex[:8]}"

        code_store[ref] = CodeBlock(
            language=meta["language"],
            code=chunk.message.text,
            description=meta["description"]
        )

        references[chunk.index] = CodeReference(
            ref_id=ref,
            language=meta["language"],
            description=meta["description"]
        )
    extracted_context = extract_with_llm(scored_chunks)
    print(extracted_context)
    # json.dumps(extracted_context, indent=2)
    # extracted_context_dict = json.loads(extracted_context)
    extracted_context_dict = extracted_context
    extracted_context_dict["codeBlocks"] = {
        ref: asdict(block)
        for ref, block in code_store.items()
    }
    json.dumps(extracted_context_dict, indent=2)
    print("===================================")
    print("===================================")
    print(extracted_context_dict)


