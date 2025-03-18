import json
import re
from llm_util import call_openai

LLM_JUDGE_SCHEMA = {
    "name": "NarrativeJudge",
    "schema": {
        "type": "object",
        "properties": {
            "judgement": {
                "type": "object",
                "properties": {
                    "overall_quality": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "identifying_major_flaws": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "character_behavior": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "common_sense_adherence": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "consistency": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "relatedness": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    },
                    "causal_temporal_relationship": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10
                    }
                },
                "required": [
                    "overall_quality",
                    "identifying_major_flaws",
                    "character_behavior",
                    "common_sense_adherence",
                    "consistency",
                    "relatedness",
                    "causal_temporal_relationship"
                ],
                "additionalProperties": False
            },
            "narrative_comments": {"type": "string"}
        },
        "required": ["judgement", "narrative_comments"],
        "additionalProperties": False
    }
}

def judge_narrative(
    narrative_text: str,
    model: str = "gpt-4o",
    temperature: float = None,
    responseFormat: dict = None
) -> dict:
    """
    Calls an LLM to rate the narrative on 7 categories (each 1..10),
    then provides a short paragraph of comments.

    If temperature is None, it is omitted from the request payload.
    On failure or parse errors, returns a fallback result.
    """
    if responseFormat is None:
        responseFormat = {
            "type": "json_schema",
            "json_schema": LLM_JUDGE_SCHEMA
        }

    prompt = f"""
You are an expert story critic. Analyze the following narrative and rate it for each of these categories, scoring each on a scale from 1 to 10 (1=very poor, 10=excellent). 
Use the **full range** if warranted. For instance:
 • (2) → extremely contradictory or incoherent 
 • (5) → okay but flawed or somewhat boring
 • (9) → excellent, with minor or no flaws
 • (10) → near-perfect

NARRATIVE:
{narrative_text}

### Categories to Rate ###
1. Overall quality: How engaging, structured, and fluid the story is.
2. Identifying major flaws: Whether the story has inconsistencies, repetitions, or unnatural patterns. Score higher if the story is free of glaring mistakes.
3. Character behavior: How consistent and believable are the characters’ actions and dialogue?
4. Common sense adherence: Do the events align with general world knowledge and logic?
5. Consistency: Does the story maintain internal logic and continuity (no contradictions)?
6. Relatedness: Do paragraphs/events connect logically to one another?
7. Causal and temporal relationship: Are cause-and-effect and chronological order handled well?

After rating each category (integers 1..10), write a short paragraph of overall comments. Be strict if you see any contradictions, lack of clarity, or poor transitions.

Return your answer **only** as valid JSON matching the schema below. For example:

{{
  "judgement": {{
    "overall_quality": 8,
    "identifying_major_flaws": 7,
    "character_behavior": 9,
    "common_sense_adherence": 8,
    "consistency": 9,
    "relatedness": 8,
    "causal_temporal_relationship": 7
  }},
  "narrative_comments": "A concise summary of your key observations"
}}

No triple backticks, no additional text. Just raw JSON.
"""

    fallback_result = {
        "judgement": {
            "overall_quality": 5,
            "identifying_major_flaws": 5,
            "character_behavior": 5,
            "common_sense_adherence": 5,
            "consistency": 5,
            "relatedness": 5,
            "causal_temporal_relationship": 5
        },
        "narrative_comments": "Error or parsing issue occurred."
    }

    # Build request parameters, omitting temperature if it's None.
    call_params = {
        "prompt": prompt,
        "model": model,
        "responseFormat": responseFormat
    }
    if temperature is not None:
        call_params["temperature"] = temperature

    try:
        llm_text = call_openai(**call_params)
    except Exception as e:
        print("Error calling OpenAI:", e)
        fallback_result["narrative_comments"] = "Error calling OpenAI"
        return fallback_result
    
    try:
        llm_json = json.loads(llm_text)
        return llm_json
    except json.JSONDecodeError:
        fallback_result["narrative_comments"] = f"Could not parse JSON. Raw response:\n{llm_text}"
        return fallback_result
