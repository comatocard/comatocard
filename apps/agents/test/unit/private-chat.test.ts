import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifiedChat } from "../../src/private-chat.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/near-ai-qwen.json", import.meta.url), "utf8"),
);
const request = JSON.parse(fixture.completion.requestBody);
const BASE = "https://cloud-api.near.ai/v1";

/** Replays the recorded completion, signature and attestation report. */
function replay(overrides: { response?: string; report?: unknown } = {}) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/chat/completions"))
      return new Response(overrides.response ?? fixture.completion.responseBody);
    if (url.includes("/signature/")) return new Response(JSON.stringify(fixture.signature));
    if (url.includes("/attestation/report"))
      return new Response(JSON.stringify(overrides.report ?? fixture.report));
    return new Response("not found", { status: 404 });
  };
}

const run = (fetch: ReturnType<typeof replay>) =>
  verifiedChat(
    { baseUrl: BASE, apiKey: "k", model: request.model, fetch, nonce: () => fixture.nonce },
    request.messages,
  );

describe("verifiedChat on recorded NEAR AI traffic", () => {
  it("verifies the response against the TEE that signed it", async () => {
    const { content, verification } = await run(replay());
    expect(content.trim()).toBe("ok");
    expect(verification).toMatchObject({
      signingAddress: fixture.signature.signing_address,
      responseHashesMatch: true,
      responseSigned: true,
      reportFound: true,
      quoteBindsKeyAndNonce: true,
      composeMeasured: true,
      verified: true,
    });
  });

  it("is not verified when the response bytes differ from what was signed", async () => {
    const tampered = fixture.completion.responseBody.replace('ok"', 'no"');
    expect(tampered).not.toBe(fixture.completion.responseBody);
    const { verification } = await run(replay({ response: tampered }));
    expect(verification.responseHashesMatch).toBe(false);
    expect(verification.verified).toBe(false);
  });

  it("is not verified when no report of the signing key comes back", async () => {
    const { verification } = await run(replay({ report: { model_attestations: [] } }));
    expect(verification).toMatchObject({ reportFound: false, quote: null, verified: false });
  });
});
