import { z } from "zod";
import { StructureSchema } from "./schema";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const ResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One structured-output chat completion. Returns the raw JSON text of the answer.
export async function completeStructured(options: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
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
