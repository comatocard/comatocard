import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkTdxQuote, expectedMrConfigId, verifyEd25519 } from "../../src/attestation.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/near-ai-qwen.json", import.meta.url), "utf8"),
);
const candidate = fixture.report.model_attestations[0];
const RECORDED = new Date("2026-11-12T12:00:00Z");

const flip = (hex: string, at: number) =>
  hex.slice(0, at) + (hex[at] === "0" ? "1" : "0") + hex.slice(at + 1);

describe("checkTdxQuote on a recorded NEAR AI quote", () => {
  it("verifies the signature chain to the pinned Intel root and reads report data", () => {
    const check = checkTdxQuote(candidate.intel_quote, RECORDED);
    expect(check).toMatchObject({
      quoteSigned: true,
      qeReportSigned: true,
      attestationKeyBound: true,
      chainToIntelRoot: true,
    });
    expect(check.reportData).toBe(`${candidate.signing_address}${fixture.nonce}`);
    expect(check.mrConfigId).toBe(
      expectedMrConfigId(JSON.parse(candidate.info.tcb_info).app_compose),
    );
  });

  it("detects a changed TD report or a certificate outside its validity", () => {
    expect(checkTdxQuote(flip(candidate.intel_quote, 1200), RECORDED).quoteSigned).toBe(false);
    expect(checkTdxQuote(candidate.intel_quote, new Date("2100-01-01")).chainToIntelRoot).toBe(
      false,
    );
  });

  it("rejects other quote versions", () => {
    expect(() => checkTdxQuote(`0300${candidate.intel_quote.slice(4)}`)).toThrow(
      "not a version 4 quote",
    );
  });
});

describe("verifyEd25519", () => {
  it("accepts the recorded response signature and rejects another text", () => {
    const { text, signature, signing_address } = fixture.signature;
    expect(verifyEd25519(text, signature, signing_address)).toBe(true);
    expect(verifyEd25519(`${text}0`, signature, signing_address)).toBe(false);
  });
});
