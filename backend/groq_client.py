import base64
import httpx
import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

GROQ_API_KEY        = os.getenv("GROQ_API_KEY")
GROQ_BASE_URL       = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL          = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_QUERY_EXPANSION = os.getenv("GROQ_QUERY_EXPANSION", "true").lower() == "true"


def _auth_header(api_key: str) -> str:
    # "user:pass" format → Basic auth (nginx-proxied Ollama)
    # plain token → Bearer (Groq / raw Ollama)
    if ":" in api_key:
        return "Basic " + base64.b64encode(api_key.encode()).decode()
    return f"Bearer {api_key}"


PARSE_PROMPT = """\
You are a search query parser for an event attendee search system.
Extract two things from the user query and return ONLY valid JSON, nothing else.

1. "semantic_query": the core topic to search — remove filler words like "people who", \
"works as", "find me", keep the industry, role and product/domain. \
Expand with 5-8 closely related synonyms, materials, or sub-roles. \
IMPORTANT: when "trader", "dealer", or "merchant" appears with an industry noun \
(e.g. "plywood traders", "textile dealer"), expand around that INDUSTRY, \
NOT around financial/commodity trading.

2. "filters": a JSON object with optional keys:
   - "experience_level": one of "junior" | "mid" | "senior" | "expert" — or omit if not mentioned
     Mapping rules:
       junior  → fresher, entry level, graduate, 0-2 years
       mid     → 3-5 years, intermediate, associate
       senior  → 5-8 years, experienced
       expert  → 10+ years, principal, staff, lead, veteran
   - "organization": exact org name if mentioned — or omit

Return ONLY this JSON format, no markdown, no explanation:
{{"semantic_query": "...", "filters": {{}}}}

Examples:
Query: "AI engineers with 5 years or less experience"
{{"semantic_query": "AI engineers machine learning deep learning NLP data science", "filters": {{"experience_level": "mid"}}}}

Query: "senior NLP researchers"
{{"semantic_query": "NLP researchers natural language processing text mining", "filters": {{"experience_level": "senior"}}}}

Query: "founders working in agriculture"
{{"semantic_query": "founders entrepreneurs agriculture agritech farming startup", "filters": {{}}}}

Query: "people who work as traders in plywood industry"
{{"semantic_query": "plywood wood merchants timber lumber building materials panel board wholesale dealer", "filters": {{}}}}

Query: "textile dealers"
{{"semantic_query": "textile fabric cloth garments wholesale dealer merchant retailer", "filters": {{}}}}

Now parse this query:
Query: "{query}"
"""


async def _call_llm(prompt: str, max_tokens: int = 150) -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    headers = {
        "Authorization": _auth_header(GROQ_API_KEY),
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try OpenAI-compat endpoint first (Groq / OpenAI / Ollama with /v1)
            resp = await client.post(
                f"{GROQ_BASE_URL}/chat/completions",
                headers=headers,
                json={
                    "model": GROQ_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.1,
                },
            )
            if resp.status_code == 404:
                # Proxy blocks /v1/chat/completions → fall back to native Ollama /api/chat
                base = GROQ_BASE_URL.rstrip("/").removesuffix("/v1")
                resp = await client.post(
                    f"{base}/api/chat",
                    headers=headers,
                    json={
                        "model": GROQ_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "options": {"temperature": 0.1, "num_predict": max_tokens},
                    },
                )
                resp.raise_for_status()
                # Ollama may return newline-delimited JSON chunks even with stream=false;
                # concatenate content from every chunk that has text.
                decoder = json.JSONDecoder()
                text = resp.text.strip()
                parts, pos = [], 0
                while pos < len(text):
                    try:
                        chunk, end = decoder.raw_decode(text, pos)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            parts.append(token)
                        pos = end
                        while pos < len(text) and text[pos] in " \t\n\r":
                            pos += 1
                    except json.JSONDecodeError:
                        break
                return "".join(parts).strip() or None
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return None


async def parse_query(query: str) -> dict:
    """
    Parse a natural language query into:
      - semantic_query: expanded query for vector search
      - filters: hard filters (experience_level, organization)

    Falls back to raw query with no filters if LLM is unavailable.
    """
    if not GROQ_API_KEY or not GROQ_QUERY_EXPANSION:
        return {"semantic_query": query, "filters": {}}

    raw = await _call_llm(PARSE_PROMPT.format(query=query))
    if not raw:
        return {"semantic_query": query, "filters": {}}

    try:
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        # raw_decode stops at the end of the first valid JSON object,
        # ignoring any extra text the LLM appends after it
        parsed, _ = json.JSONDecoder().raw_decode(cleaned)
        semantic = parsed.get("semantic_query", query).strip() or query
        filters  = {
            k: v for k, v in parsed.get("filters", {}).items()
            if v and isinstance(v, str)
        }
        logger.info("Parsed '%s' → semantic='%s' filters=%s", query, semantic[:60], filters)
        return {"semantic_query": semantic, "filters": filters}
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning("Failed to parse LLM response '%s': %s", raw, e)
        return {"semantic_query": query, "filters": {}}
