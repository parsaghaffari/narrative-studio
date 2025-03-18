import axios from 'axios';
import { openAIConfig } from './config';

export async function callOpenAI(
  prompt: string,
  model: string = 'gpt-4o',
  temperature: number = 1,
  skipTemperature: boolean = false,
  responseFormat?: any,
  maxCompletionTokens?: number
): Promise<string> {
  const { apiKey } = openAIConfig;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(!skipTemperature && { temperature }),
        ...(responseFormat && { response_format: responseFormat }),
        ...(maxCompletionTokens !== undefined && { max_completion_tokens: maxCompletionTokens })
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) {
    if (error.response) {
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error', error.message);
    }
    throw new Error('Failed to fetch data from OpenAI');
  }
}

export async function generateNextEvent(fromData: any, parents: any, modelData: any): Promise<object> {
  const { text, prevGuessesForward } = fromData;
  const {
    eventPrompt,
    eventLikelihood,
    eventSeverity,
    eventTemperature,
    entitiesDescription,
    useGpt4,
    includeEntityGraph
  } = modelData;

  let parentsArray: string[] = Array.isArray(parents) ? parents : [];

  let parentsText = "";
  if (parentsArray.length > 0) {
    parentsText = parentsArray.map(ev => `- ${ev}`).join("\n");
  }

  let likelihoodText = 'medium';
  if (Array.isArray(eventLikelihood) && eventLikelihood.length > 0) {
    const idx = eventLikelihood[0];
    likelihoodText = ['very low', 'low', 'medium', 'high', 'very high'][idx - 1] || 'medium';
  }

  let severityText = 'medium';
  if (Array.isArray(eventSeverity) && eventSeverity.length > 0) {
    const idx = eventSeverity[0];
    severityText = ['very low', 'low', 'medium', 'high', 'very high'][idx - 1] || 'medium';
  }

  let prompt = `
You are a creative storyteller. Follow the instructions below, taking the story context thus far into account, to generate the next event in this story.

--- INSTRUCTIONS ---
• Write a single story event (2–3 sentences) that moves the plot forward.
• Escalate tension, reveal new details, or deepen character relationships.
• Be logically consistent with existing events but also add an element of surprise or conflict.
• Avoid contradicting established facts or merely repeating prior events.
• Like a good storywriter, try to use "but" or "therefore" to piece together ideas—without overusing or over-mentioning them.
• Do NOT include extra punctuation. Keep it concise and compelling.

[STORY CONTEXT]
${parentsText ? `Events in the story so far:\n${parentsText}` : "(No prior events)"}

`;

  if (entitiesDescription && includeEntityGraph) {
    prompt += `\nConsider this entity graph (characters, locations, relationships):\n${entitiesDescription}\n`;
  }

  if (eventPrompt) {
    prompt += `\nAdditional user context:\n${eventPrompt}\n`;
  }

  if (prevGuessesForward && prevGuessesForward.length > 0) {
    prompt += `\nPreviously generated next events in the story - diverge significantly from these, and don't reference them in your output, to create an alternative path in the story:\n${prevGuessesForward.map((pg: string) => "- " + pg).join('\n')}\n`;
  }

  prompt += "\nNow, considering the instructions and the story context above, write the next event:\n";

  console.log('Prompt:', prompt);

  const response = await callOpenAI(
    prompt,
    useGpt4 ? 'gpt-4' : 'gpt-4o',
    eventTemperature ? eventTemperature[0] : 0.7,
    undefined,
    undefined,
    300
  );

  return {
    text: response,
    eventLikelihood: Array.isArray(eventLikelihood) ? eventLikelihood : [3],
    eventSeverity: Array.isArray(eventSeverity) ? eventSeverity : [3]
  };
};

export async function generatePreviousEvent(fromData: any, modelData: any): Promise<object> {
  const { text, prevGuessesBackward } = fromData;
  const { eventPrompt, eventLikelihood, eventSeverity, eventTemperature, entitiesDescription, useGpt4, includeEntityGraph } = modelData;

  const eventLikelihoodText = eventLikelihood.map(l => ['very low', 'low', 'medium', 'high', 'very high'][l - 1])[0];
  const eventSeverityText = eventSeverity.map(s => ['very low', 'low', 'medium', 'high', 'very high'][s - 1])[0];

  let prompt = `Given the below context, what is a ${eventLikelihoodText} likelihood prior cause or event with a ${eventSeverityText} impact (positive or negative) that could lead to the current event? Respond with a clear event narrative that could precede the current event. Do NOT include extra punctuation or words unrelated to the narrative. Keep it concise and compelling. Don't say "Prior event:".\n`;

  prompt += `Current event:\n- ${text}\n`;

  if (entitiesDescription && includeEntityGraph) {
    prompt += `Consider this graph of entities and their relationships in your response:\n${entitiesDescription}\n`;
  }
  if (eventPrompt) {
    prompt += `Additional context from the user: ${eventPrompt}\n`;
  }
  if (prevGuessesBackward.length > 0) {
    prompt += `You have previously guessed the following events - try to make your next guess different, and vary it in terms of sentiment, or time horizon, or polarity:\n`;
    prompt += prevGuessesBackward.map((pg: string) => `- ${pg}`).join('\n') + '\n';
  }

  console.log('Prompt:', prompt);

  const response = await callOpenAI(prompt, useGpt4 ? 'gpt-4' : 'gpt-4o', eventTemperature[0]);

  return {
    text: response,
    eventLikelihood: eventLikelihood,
    eventSeverity: eventSeverity
  };
};

export async function generateEntityGraph(
  entitiesPrompt: string,
  entityTypes: any[],
  relationshipTypes: any[],
  currentGraph: string,
): Promise<{ entitiesNodeDataArray: any[]; entitiesLinkDataArray: any[] }> {
  const prompt = `
Based on the following information, construct a JSON object representing a directional graph with shape:
{
  "entitiesNodeDataArray": [...],
  "entitiesLinkDataArray": [...]
}
  
You are given:
- Entity prompt: ${entitiesPrompt}
- Entity types: ${entityTypes.length > 0 ? JSON.stringify(entityTypes) : 'any'}
- Relationship types: ${relationshipTypes.length > 0 ? JSON.stringify(relationshipTypes) : 'any'}
${currentGraph != '' ? `- Current graph for reference (try not to use colliding keys, and refer to the current links and entities using their keys):\n${currentGraph}` : ''}

Here is an example schema:
- entitiesNodeDataArray: [{"text":"iPhone","color":"lightblue","key":0}, {"text":"screen","color":"lightgreen","key":1}]
- entitiesLinkDataArray: [{"text":"has_part","from":0,"to":1,"key":-1}]

All nodes of the same type should have the same colour. No extra commentary or keys aside from these two arrays. No backticks or triple quotes around the JSON.`;

  const entityGraphSchema = {
    name: "entityGraphResponse",
    schema: {
      type: "object",
      properties: {
        entitiesNodeDataArray: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              color: { type: "string" },
              key: { type: "number" }
            },
            required: ["text", "color", "key"],
            additionalProperties: false
          }
        },
        entitiesLinkDataArray: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              from: { type: "number" },
              to: { type: "number" },
              key: { type: "number" }
            },
            required: ["text", "from", "to", "key"],
            additionalProperties: false
          }
        }
      },
      required: ["entitiesNodeDataArray", "entitiesLinkDataArray"],
      additionalProperties: false,
      strict: true
    }
  };

  const responseFormat = {
    type: "json_schema",
    json_schema: entityGraphSchema
  };

  const response = await callOpenAI(prompt, "gpt-4o", 0, responseFormat);
  try {
    const json = JSON.parse(response);
    return {
      entitiesNodeDataArray: json.entitiesNodeDataArray || [],
      entitiesLinkDataArray: json.entitiesLinkDataArray || []
    };
  } catch (e) {
    throw new Error('Invalid JSON returned from OpenAI.');
  }
}

export async function generateAqlFromOpenAI(eventText: string): Promise<string> {
  const prompt = `${generateAqlPrompt}\nprompt: ${eventText}\nquery:`;
  const response = await callOpenAI(prompt, 'gpt-4', 0.8);
  return response;
}

export async function scoreEventWithOpenAI(
  eventText: string,
  userPrompt?: string
): Promise<number> {
  const domainConstraintsLine = userPrompt
    ? `Below are domain-specific or user-specified constraints:\n- ${userPrompt}\n`
    : "";

  const ratingPrompt = `
You are an expert story critic. Rate this narrative event for coherence, creativity, and engagement, paying special attention to how it connects with prior context.

Use the **full 1–10 range** if warranted:
  - 1 → extremely incoherent, contradictory, or uninteresting
  - 2–4 → event has big flaws or is mostly unengaging
  - 5–6 → somewhat coherent or passable, but not particularly strong
  - 7–8 → a good event that is coherent, interesting, and mostly consistent
  - 9 → an excellent event, fresh or surprising yet still logical
  - 10 → near-perfect event with no apparent flaws

${domainConstraintsLine}
Penalize heavily if any of the following occur:
  - The event violates the above domain constraints (if any) 
  - The event repeats prior text with no meaningful change
  - The event contradicts established facts or is obviously illogical
  - The event is dull or adds nothing new
  - The event includes gibberish or weird, nonsensical characters

Reward if:
  - The event is novel and contributes something interesting to the story
  - It remains logically consistent with prior context and timeline
  - It is creative, engaging, and adheres to any user-specified constraints

### Example Ratings
1. **Poor Event (score 2)**
   "There's an obvious timeline contradiction or unexplained character appearing out of nowhere."
2. **So-So Event (score 5)**
   "The event is coherent but bland, adds no real tension or new information."
3. **Excellent Event (score 9)**
   "The event heightens conflict in a fresh way, stays consistent with prior facts, and feels natural."

Only output **one integer** from 1 to 10.

NARRATIVE EVENT:
${eventText}
`;

  try {
    const llmResponse = await callOpenAI(ratingPrompt, 'gpt-4o', 0.3);
    let score = parseInt(llmResponse, 10);
    if (isNaN(score) || score < 1 || score > 10) {
      score = 5;
    }

    console.log(
      `LLM scoring ->\nEvent: "${eventText}",\nUser prompt (constraints): "${
        userPrompt || "[None]"
      }", `
      + `\nLLM raw response: "${llmResponse}", final score: ${score}`
    );

    return score;
  } catch (err) {
    console.error("Error in LLM scoring:", err);
    return 5;
  }
}

export async function scoreEventWithJudge(
  eventText: string,
  userPrompt: string
): Promise<number> {
  try {
    const judgeResult = await judgeNarrative(eventText, 'o1', 0.0);
    if (!judgeResult || !judgeResult.judgement) {
      throw new Error("Invalid response from judgeNarrative");
    }

    const {
      overall_quality,
      identifying_major_flaws,
      character_behavior,
      common_sense_adherence,
      consistency,
      relatedness,
      causal_temporal_relationship
    } = judgeResult.judgement;

    const totalScore =
      overall_quality +
      identifying_major_flaws +
      character_behavior +
      common_sense_adherence +
      consistency +
      relatedness +
      causal_temporal_relationship;
    const averageScore = totalScore / 7;
    const score = Math.round(averageScore);

    console.log(
      `LLM scoring via judgeNarrative -> event: "${eventText}", user prompt: "${userPrompt}", computed score: ${score}`,
      judgeResult
    );

    return score;
  } catch (error) {
    console.error("Error in judgeNarrative scoring:", error);
    return 5;
  }
}


export async function judgeNarrative(
  narrativeText: string,
  model: string = "gpt-4o",
  temperature: number = 0.0,
  responseFormat?: any
): Promise<any> {
  const LLM_JUDGE_SCHEMA = {
    name: "NarrativeJudge",
    schema: {
      type: "object",
      properties: {
        judgement: {
          type: "object",
          properties: {
            overall_quality: { type: "integer", minimum: 1, maximum: 10 },
            identifying_major_flaws: { type: "integer", minimum: 1, maximum: 10 },
            character_behavior: { type: "integer", minimum: 1, maximum: 10 },
            common_sense_adherence: { type: "integer", minimum: 1, maximum: 10 },
            consistency: { type: "integer", minimum: 1, maximum: 10 },
            relatedness: { type: "integer", minimum: 1, maximum: 10 },
            causal_temporal_relationship: { type: "integer", minimum: 1, maximum: 10 }
          },
          required: [
            "overall_quality",
            "identifying_major_flaws",
            "character_behavior",
            "common_sense_adherence",
            "consistency",
            "relatedness",
            "causal_temporal_relationship"
          ],
          additionalProperties: false
        },
        narrative_comments: { type: "string" }
      },
      required: ["judgement", "narrative_comments"],
      additionalProperties: false
    }
  };

  if (!responseFormat) {
    responseFormat = {
      type: "json_schema",
      json_schema: LLM_JUDGE_SCHEMA
    };
  }

  const prompt = `
You are an expert story critic. Analyze the following narrative and rate it for each of these categories, scoring each on a scale from 1 to 10 (1=very poor, 10=excellent). 
Use the **full range** if warranted. For instance:
 • (2) → extremely contradictory or incoherent 
 • (5) → okay but flawed or somewhat boring
 • (9) → excellent, with minor or no flaws
 • (10) → near-perfect

NARRATIVE:
${narrativeText}

### Categories to Rate ###
1. Overall quality: How engaging, structured, and fluid the story is.
2. Identifying major flaws: Whether the story has inconsistencies, repetitions, or unnatural patterns. Score higher if the story is free of glaring mistakes.
3. Character behavior: How consistent and believable are the characters' actions and dialogue?
4. Common sense adherence: Do the events align with general world knowledge and logic?
5. Consistency: Does the story maintain internal logic and continuity (no contradictions)?
6. Relatedness: Do paragraphs/events connect logically to one another?
7. Causal and temporal relationship: Are cause-and-effect and chronological order handled well?

After rating each category (integers 1..10), write a short paragraph of overall comments. Be strict if you see any contradictions, lack of clarity, or poor transitions.

Return your answer **only** as valid JSON matching the schema below. For example:

{
  "judgement": {
    "overall_quality": 8,
    "identifying_major_flaws": 7,
    "character_behavior": 9,
    "common_sense_adherence": 8,
    "consistency": 9,
    "relatedness": 8,
    "causal_temporal_relationship": 7
  },
  "narrative_comments": "A concise summary of your key observations"
}

No triple backticks, no additional text. Just raw JSON.
`;

  let llmText: string;
  try {
    llmText = await callOpenAI(prompt, model, temperature, true, responseFormat);
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return {
      judgement: {
        overall_quality: 5,
        identifying_major_flaws: 5,
        character_behavior: 5,
        common_sense_adherence: 5,
        consistency: 5,
        relatedness: 5,
        causal_temporal_relationship: 5
      },
      narrative_comments: "Error calling OpenAI"
    };
  }

  try {
    const llmJson = JSON.parse(llmText);
    return llmJson;
  } catch (error) {
    return {
      judgement: {
        overall_quality: 5,
        identifying_major_flaws: 5,
        character_behavior: 5,
        common_sense_adherence: 5,
        consistency: 5,
        relatedness: 5,
        causal_temporal_relationship: 5
      },
      narrative_comments: `Could not parse JSON. Raw response:\n${llmText}`
    };
  }
}
