import { describe, expect, it, vi } from "vitest";
import { CARD_PAY_GAS, createVaultClient, ViewError, vaultCalls } from "../src/client.js";

const rpcUrl = "https://rpc.testnet.example";
const vaultId = "alice.factory.testnet";

function rpcReturning(value: unknown, init?: { status?: number; error?: unknown }) {
  const bytes = [...new TextEncoder().encode(JSON.stringify(value))];
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const body =
      init?.error === undefined
        ? { jsonrpc: "2.0", id: "comatocard", result: { result: bytes } }
        : { jsonrpc: "2.0", id: "comatocard", ...(init.error as object) };
    return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
  });
}

const config = {
  owner: "alice.testnet",
  pending_owner: null,
  factory: "factory.testnet",
  registry: null,
  approval_ttl: "86400000000000",
  contract_version: "0.1.0",
};

describe("createVaultClient", () => {
  it("sends a final call_function query with base64 JSON args", async () => {
    const fetch = rpcReturning({ status: "allowed" });
    const client = createVaultClient({ rpcUrl, vaultId, fetch });
    const preview = await client.previewPayment(
      "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp",
      "shop.testnet",
      "1000",
    );
    expect(preview).toEqual({ status: "allowed" });
    const [, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.params).toMatchObject({
      request_type: "call_function",
      finality: "final",
      account_id: vaultId,
      method_name: "preview_payment",
    });
    expect(JSON.parse(atob(body.params.args_base64))).toEqual({
      public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp",
      merchant: "shop.testnet",
      amount: "1000",
    });
  });

  it("validates responses", async () => {
    const client = createVaultClient({ rpcUrl, vaultId, fetch: rpcReturning(config) });
    await expect(client.getConfig()).resolves.toEqual(config);
    const broken = createVaultClient({
      rpcUrl,
      vaultId,
      fetch: rpcReturning({ ...config, owner: 7 }),
    });
    await expect(broken.getConfig()).rejects.toBeInstanceOf(ViewError);
  });

  it("passes pagination and nullable results through", async () => {
    const fetch = rpcReturning(null);
    const client = createVaultClient({ rpcUrl, vaultId, fetch });
    await expect(client.getCard(4)).resolves.toBeNull();
    const list = createVaultClient({ rpcUrl, vaultId, fetch: rpcReturning([]) });
    await expect(list.listCards({ fromIndex: 10, limit: 5 })).resolves.toEqual([]);
    await expect(list.listPayments()).resolves.toEqual([]);
    await expect(list.listApprovers()).resolves.toEqual([]);
    await expect(list.getBalances()).resolves.toEqual([]);
  });

  it("surfaces RPC, contract and transport errors", async () => {
    const contractError = createVaultClient({
      rpcUrl,
      vaultId,
      fetch: rpcReturning(null, { error: { result: { error: "card not found" } } }),
    });
    await expect(contractError.getPayment(1)).rejects.toThrow("card not found");
    const rpcError = createVaultClient({
      rpcUrl,
      vaultId,
      fetch: rpcReturning(null, { error: { error: { name: "HANDLER_ERROR" } } }),
    });
    await expect(rpcError.getCardByKey("ed25519:abc")).rejects.toThrow("HANDLER_ERROR");
    const http = createVaultClient({ rpcUrl, vaultId, fetch: rpcReturning(null, { status: 503 }) });
    await expect(http.getConfig()).rejects.toThrow("RPC responded 503");
    const empty = createVaultClient({
      rpcUrl,
      vaultId,
      fetch: rpcReturning(null, { error: { result: {} } }),
    });
    await expect(empty.getConfig()).rejects.toThrow("empty result");
  });
});

describe("vaultCalls", () => {
  const calls = vaultCalls(vaultId);

  it("builds a card payment with the card gas and no deposit", () => {
    expect(calls.pay({ merchant: "shop.testnet", amount: "25" })).toEqual({
      receiverId: vaultId,
      methodName: "pay",
      args: { merchant: "shop.testnet", amount: "25", memo: null, reference: null },
      gas: CARD_PAY_GAS,
      deposit: "0",
    });
  });

  it("maps every owner method to its contract arguments", () => {
    expect(calls.freezeCard(1).args).toEqual({ card_id: 1 });
    expect(calls.unfreezeCard(1).methodName).toBe("unfreeze_card");
    expect(calls.revokeCard(1).methodName).toBe("revoke_card");
    expect(calls.rotateCardKey(1, "ed25519:abc").args).toEqual({
      card_id: 1,
      new_public_key: "ed25519:abc",
      gas_allowance: null,
    });
    expect(calls.setApprover("council.testnet", null).args).toEqual({
      account_id: "council.testnet",
      max_amount: null,
    });
    expect(calls.approvePayment(3).gas).toBe("100000000000000");
    expect(calls.declinePayment(3).args).toEqual({ payment_id: 3 });
    expect(calls.expirePayment(3).methodName).toBe("expire_payment");
    expect(calls.withdraw("tusd.testnet", "5", "alice.testnet").args).toEqual({
      token: "tusd.testnet",
      amount: "5",
      receiver_id: "alice.testnet",
    });
    const policy = {
      token: "tusd.testnet",
      per_tx_limit: "100",
      daily_limit: "100",
      monthly_limit: "100",
      approval_threshold: null,
      merchants: "any" as const,
      valid_from: null,
      expires_at: null,
      risk_mode: "off" as const,
    };
    expect(calls.updatePolicy(1, policy).args).toEqual({ card_id: 1, policy });
    expect(
      calls.createCard({ publicKey: "ed25519:abc", label: "x", kind: "agent", policy }).args,
    ).toEqual({
      public_key: "ed25519:abc",
      label: "x",
      kind: "agent",
      policy,
      gas_allowance: null,
    });
  });
});
