import { z } from "zod";

const toolCall = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const assistantMessage = z.object({
  role: z.literal("assistant"),
  content: z.string().nullable().optional(),
  tool_calls: z.array(toolCall).optional(),
});

const completion = z.object({ choices: z.array(z.object({ message: assistantMessage })).min(1) });

export type ToolCall = z.infer<typeof toolCall>;
export type AssistantMessage = z.infer<typeof assistantMessage>;
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

export interface Tool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** One chat completion turn. */
export type Chat = (messages: ChatMessage[], tools: Tool[]) => Promise<AssistantMessage>;

/** Chat completions on an OpenAI-compatible endpoint such as NEAR AI Cloud. */
export function openAiChat(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
}): Chat {
  const fetchFn = options.fetch ?? globalThis.fetch;
  return async (messages, tools) => {
    const response = await fetchFn(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ model: options.model, messages, tools }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`chat: ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    const parsed = completion.safeParse(await response.json());
    if (!parsed.success)
      throw new Error(`chat: unexpected response\n${z.prettifyError(parsed.error)}`);
    // The schema requires at least one choice.
    return (parsed.data.choices[0] as { message: AssistantMessage }).message;
  };
}
