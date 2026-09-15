import { z } from "zod";
import { StructureSchema } from "./schema";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Opus answers within 30 seconds; a model that never answers must not hold the
// request forever. The error lands in song.analysis.error like any other.
const TIMEOUT_MS = 120_000;

const ResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One structured-output chat completion. Returns the raw JSON text of the answer.
// Gives up after TIMEOUT_MS.
export async function completeStructured(options: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "structure", strict: true, schema: structureJsonSchema() },
      },
    }),
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error(`OpenRouter antwortete nicht innerhalb von ${TIMEOUT_MS / 1000} s`);
    throw error;
  });
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const parsed = ResponseSchema.parse(await response.json());
  const content = parsed.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter returned an empty message");
  return content;
}

// Zod emits draft 2020 metadata and safe-integer bounds that structured output
// endpoints reject. Keep the schema to the keys they all accept.
export function structureJsonSchema(): unknown {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !["$schema", "maximum", "minLength", "minItems"].includes(key))
          .map(([key, v]) => [key, strip(v)]),
      );
    }
    return value;
  };
  return strip(z.toJSONSchema(StructureSchema));
}
