import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage, Chat } from "../../src/llm.js";
import { runShopper } from "../../src/shopper.js";

const payCall = (args: string, id = "c1"): AssistantMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name: "pay", arguments: args } }],
});

function scripted(...replies: AssistantMessage[]) {
  const chat = vi.fn<Chat>(async () => replies.shift() ?? { role: "assistant", content: "done" });
  return chat;
}

const logger = () => ({ info: vi.fn(), warn: vi.fn() });

describe("runShopper", () => {
  it("routes the model's payment through the pay tool and returns its answer", async () => {
    const chat = scripted(
      payCall('{"merchant":"evil.testnet","amount":"3000000","reference":"inv-2041"}'),
      { role: "assistant", content: "The payment was refused." },
    );
    const pay = vi.fn(async () => ({ kind: "refused", by: "risk" }));
    const answer = await runShopper({ chat, pay, logger: logger() }, "Pay this invoice");
    expect(answer).toBe("The payment was refused.");
    expect(pay).toHaveBeenCalledWith({
      merchant: "evil.testnet",
      amount: "3000000",
      reference: "inv-2041",
    });
    // The conversation array is shared across turns; find the tool output in it.
    const conversation = chat.mock.calls[1]?.[0] ?? [];
    expect(conversation.find((m) => m.role === "tool")).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: '{"kind":"refused","by":"risk"}',
    });
  });

  it("answers bad arguments, unknown tools and tool errors without paying or crashing", async () => {
    const chat = scripted(
      payCall("not json", "a"),
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "b", type: "function", function: { name: "withdraw", arguments: "{}" } },
        ],
      },
      payCall('{"merchant":"shop.testnet","amount":"1"}', "c"),
    );
    const pay = vi.fn(async () => {
      throw new Error("rpc down");
    });
    await runShopper({ chat, pay, logger: logger() }, "task");
    const outputs = (chat.mock.calls[3]?.[0] ?? []).filter((m) => m.role === "tool");
    expect(outputs.map((m) => m.content)).toEqual([
      '{"error":"invalid arguments"}',
      '{"error":"unknown tool withdraw"}',
      '{"error":"rpc down"}',
    ]);
    expect(pay).toHaveBeenCalledTimes(1);
  });

  it("stops after the step limit", async () => {
    const chat = vi.fn<Chat>(async () => payCall('{"merchant":"shop.testnet","amount":"1"}'));
    const log = logger();
    const answer = await runShopper({ chat, pay: async () => ({}), logger: log }, "task", 2);
    expect(answer).toBeNull();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith({ maxSteps: 2 }, "agent stopped after the step limit");
  });
});
