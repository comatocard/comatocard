import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  checkTdxQuote,
  expectedMrConfigId,
  type QuoteCheck,
  verifyEd25519,
} from "./attestation.js";

const completion = z.object({
  id: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});
const signature = z.object({
  text: z.string(),
  signature: z.string(),
  signing_address: z.string(),
  signing_algo: z.literal("ed25519"),
});
const report = z.object({
  model_attestations: z
    .array(
      z.object({
        signing_address: z.string(),
        signing_algo: z.string(),
        request_nonce: z.string(),
        intel_quote: z.string(),
        info: z.object({
          compose_hash: z.string(),
          tcb_info: z.union([z.string(), z.record(z.string(), z.unknown())]),
        }),
      }),
    )
    .default([]),
});

export interface Verification {
  model: string;
  signingAddress: string;
  /** The signed text is `model:sha256(request):sha256(response)` of the exact bytes. */
  responseHashesMatch: boolean;
  responseSigned: boolean;
  /** An attestation report for the signing key was returned for our fresh nonce. */
  reportFound: boolean;
  quote: QuoteCheck | null;
  /** Report data is the signing key followed by our nonce. */
  quoteBindsKeyAndNonce: boolean;
  /** MRCONFIGID is the hash of the app compose the TEE publishes. */
  composeMeasured: boolean;
  composeHash: string | null;
  /** Every check above passed. */
  verified: boolean;
}

const REPORT_ATTEMPTS = 3;

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * One chat completion on NEAR AI Cloud, verified end to end against the TEE that signed it.
 * Not checked: TCB level and revocation, NVIDIA GPU evidence, an allowlist of measurements.
 */
export async function verifiedChat(
  options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    fetch?: typeof globalThis.fetch;
    /** Fresh 32-byte hex nonce per attestation request; injectable for recorded tests. */
    nonce?: () => string;
  },
  messages: { role: "system" | "user"; content: string }[],
): Promise<{ content: string; verification: Verification }> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const auth = { authorization: `Bearer ${options.apiKey}` };
  const body = JSON.stringify({ model: options.model, messages });
  const response = await fetchFn(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`chat: ${response.status} ${raw.slice(0, 200)}`);
  const chat = completion.parse(JSON.parse(raw));

  const signed = signature.parse(
    await getJson(
      fetchFn,
      `${options.baseUrl}/signature/${chat.id}?model=${encodeURIComponent(options.model)}&signing_algo=ed25519`,
      auth,
    ),
  );
  // Several TEE instances serve a model; ask again with a fresh nonce until the signer reports.
  let nonce = "";
  let candidate: z.infer<typeof report>["model_attestations"][number] | undefined;
  for (let attempt = 0; attempt < REPORT_ATTEMPTS && candidate === undefined; attempt++) {
    nonce = options.nonce?.() ?? randomBytes(32).toString("hex");
    const query = new URLSearchParams({
      model: options.model,
      provider: "near",
      include_tls_fingerprint: "false",
      signing_algo: "ed25519",
      nonce,
    });
    const reports = report.parse(
      await getJson(fetchFn, `${options.baseUrl}/attestation/report?${query}`, {
        ...auth,
        "x-no-aliasing": "true",
      }),
    );
    candidate = reports.model_attestations.find(
      (c) =>
        c.signing_address === signed.signing_address &&
        c.signing_algo === "ed25519" &&
        c.request_nonce === nonce,
    );
  }
  const quote = candidate ? checkTdxQuote(candidate.intel_quote) : null;
  const tcb = candidate ? parseTcb(candidate.info.tcb_info) : undefined;
  const checks = {
    responseHashesMatch: signed.text === `${options.model}:${sha256(body)}:${sha256(raw)}`,
    responseSigned: verifyEd25519(signed.text, signed.signature, signed.signing_address),
    reportFound: candidate !== undefined,
    quoteBindsKeyAndNonce: quote?.reportData === `${signed.signing_address}${nonce}`,
    composeMeasured:
      quote !== null &&
      typeof tcb?.app_compose === "string" &&
      expectedMrConfigId(tcb.app_compose) === quote.mrConfigId,
  };
  const quoteOk =
    quote?.quoteSigned === true &&
    quote.qeReportSigned &&
    quote.attestationKeyBound &&
    quote.chainToIntelRoot;
  return {
    content: chat.choices[0]?.message.content ?? "",
    verification: {
      model: options.model,
      signingAddress: signed.signing_address,
      ...checks,
      quote,
      composeHash: candidate?.info.compose_hash ?? null,
      verified: quoteOk && Object.values(checks).every(Boolean),
    },
  };
}

async function getJson(
  fetchFn: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
) {
  const response = await fetchFn(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname}: ${response.status}`);
  return response.json();
}

function parseTcb(value: string | Record<string, unknown>): Record<string, unknown> | undefined {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
