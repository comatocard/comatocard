import { describe, expect, it, vi } from "vitest";
import { openAiChat } from "../../src/llm.js";

const reply = { role: "assistant", content: "done" };

describe("openAiChat", () => {
  it("posts the model, messages and tools with the bearer key", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: reply }] })),
    );
    const chat = openAiChat({ baseUrl: "https://ai.example/v1/", apiKey: "k", model: "m", fetch });
    await expect(chat([{ role: "user", content: "hi" }], [])).resolves.toEqual(reply);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://ai.example/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer k");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "m", temperature: 0 });
  });

  it("throws on HTTP errors and malformed completions", async () => {
    const failing = openAiChat({
      baseUrl: "https://ai.example/v1",
      apiKey: "k",
      model: "m",
      fetch: async () => new Response("quota exceeded", { status: 429 }),
    });
    await expect(failing([], [])).rejects.toThrow("chat: 429 quota exceeded");
    const empty = openAiChat({
      baseUrl: "https://ai.example/v1",
      apiKey: "k",
      model: "m",
      fetch: async () => new Response(JSON.stringify({ choices: [] })),
    });
    await expect(empty([], [])).rejects.toThrow("unexpected response");
  });
});
