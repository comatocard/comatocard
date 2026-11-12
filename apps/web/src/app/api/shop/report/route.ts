import { paymentRow } from "@comatocard/sdk";
import { z } from "zod";
import { RPC_URL, TOKEN_ID } from "@/lib/config";
import { challenge, isReference, MERCHANT_ID, newReference, settledPayment } from "@/lib/merchant";
import { INDEXER_URL, upstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/** References already served, so one payment unlocks the resource once. Per server instance. */
const served = new Set<string>();

const gasPrice = z.object({ result: z.object({ gas_price: z.string() }) });
const block = z.object({
  result: z.object({ header: z.object({ height: z.number(), timestamp_nanosec: z.string() }) }),
});

async function rpc<T>(method: string, params: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "shop", method, params }),
    cache: "no-store",
  });
  return schema.parse(await response.json());
}

/**
 * A resource behind HTTP 402. Without a paid reference it answers 402 with a fresh challenge; once
 * the indexer reports a `payment_settled` to the merchant with that reference, it serves the
 * resource: a live report of the NEAR testnet gas price.
 */
export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference || !isReference(reference)) {
    return Response.json(challenge(TOKEN_ID, newReference()), {
      status: 402,
      headers: { "x-payment-required": `near:${MERCHANT_ID}` },
    });
  }
  if (served.has(reference)) {
    return Response.json({ error: "This reference was already used." }, { status: 409 });
  }
  let rows: z.infer<typeof paymentRow>[];
  try {
    const url = upstream(
      INDEXER_URL,
      `merchants/${MERCHANT_ID}/payments`,
      `?reference=${reference}`,
    );
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    rows = z.array(paymentRow).parse(await response.json());
  } catch {
    return Response.json({ error: "The payment could not be checked." }, { status: 503 });
  }
  const paid = settledPayment(rows, reference, TOKEN_ID);
  if (!paid) {
    const pending = rows.find((r) => r.reference === reference);
    return Response.json(
      {
        ...challenge(TOKEN_ID, reference),
        status: pending?.status ?? "unpaid",
        reason: pending?.reason ?? null,
      },
      { status: 402 },
    );
  }
  served.add(reference);
  const [gas, head] = await Promise.all([
    rpc("gas_price", [null], gasPrice),
    rpc("block", { finality: "final" }, block),
  ]);
  return Response.json({
    resource: "NEAR testnet gas report",
    gas_price_yocto: gas.result.gas_price,
    block_height: head.result.header.height,
    block_timestamp: head.result.header.timestamp_nanosec,
    receipt: {
      reference,
      payment_id: paid.payment_id,
      tx_hash: paid.tx_hash,
      vault: paid.vault_id,
    },
  });
}
