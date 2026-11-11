import { z } from "zod";
import type { AccountId, PublicKey, U128 } from "./primitives.js";
import {
  type Approver,
  approver,
  type Card,
  type CardKind,
  card,
  type Payment,
  type PaymentPreview,
  type Policy,
  payment,
  paymentPreview,
  type TokenBalance,
  tokenBalance,
  type VaultConfig,
  vaultConfig,
} from "./types.js";

/** Gas a card attaches to `pay`; it fits the default card key allowance. */
export const CARD_PAY_GAS = "100000000000000";
/** Gas for owner methods. */
export const OWNER_CALL_GAS = "50000000000000";
/** Gas for owner methods that make cross-contract calls (approve, withdraw). */
export const OWNER_ASYNC_CALL_GAS = "100000000000000";

/** A function call ready to be signed by a wallet, a card key or a relayer. */
export interface FunctionCall {
  receiverId: AccountId;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

/** Raised when a view call fails on chain or returns an unexpected shape. */
export class ViewError extends Error {
  override name = "ViewError";
}

type Fetch = typeof globalThis.fetch;

export interface VaultClientOptions {
  rpcUrl: string;
  vaultId: AccountId;
  fetch?: Fetch;
}

const rpcResponse = z.object({
  result: z
    .object({ result: z.array(z.number().int()).optional(), error: z.string().optional() })
    .optional(),
  error: z.unknown().optional(),
});

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary);
}

/** Calls a view method over NEAR JSON-RPC and validates the result with `schema`. */
export async function viewFunction<T>(
  options: { rpcUrl: string; fetch?: Fetch },
  contractId: AccountId,
  method: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const response = await fetchFn(options.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "comatocard",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: toBase64(JSON.stringify(args)),
      },
    }),
  });
  if (!response.ok) {
    throw new ViewError(`${method}: RPC responded ${response.status}`);
  }
  const body = rpcResponse.parse(await response.json());
  if (body.error !== undefined) {
    throw new ViewError(`${method}: ${JSON.stringify(body.error)}`);
  }
  if (body.result?.error !== undefined) {
    throw new ViewError(`${method}: ${body.result.error}`);
  }
  const bytes = body.result?.result;
  if (bytes === undefined) {
    throw new ViewError(`${method}: empty result`);
  }
  const decoded: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ViewError(`${method}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export interface Page {
  fromIndex?: number;
  limit?: number;
}

function page({ fromIndex, limit }: Page = {}): Record<string, number | null> {
  return { from_index: fromIndex ?? null, limit: limit ?? null };
}

/** Typed read access to one vault. */
export function createVaultClient(options: VaultClientOptions) {
  const view = <T>(method: string, args: Record<string, unknown>, schema: z.ZodType<T>) =>
    viewFunction(options, options.vaultId, method, args, schema);
  return {
    vaultId: options.vaultId,
    getConfig: (): Promise<VaultConfig> => view("get_config", {}, vaultConfig),
    getBalances: (): Promise<TokenBalance[]> => view("get_balances", {}, z.array(tokenBalance)),
    listCards: (p?: Page): Promise<Card[]> => view("list_cards", page(p), z.array(card)),
    getCard: (cardId: number): Promise<Card | null> =>
      view("get_card", { card_id: cardId }, card.nullable()),
    getCardByKey: (key: PublicKey): Promise<Card | null> =>
      view("get_card_by_key", { public_key: key }, card.nullable()),
    listPayments: (p?: Page): Promise<Payment[]> =>
      view("list_payments", page(p), z.array(payment)),
    getPayment: (paymentId: number): Promise<Payment | null> =>
      view("get_payment", { payment_id: paymentId }, payment.nullable()),
    listApprovers: (): Promise<Approver[]> => view("list_approvers", {}, z.array(approver)),
    previewPayment: (key: PublicKey, merchant: AccountId, amount: U128): Promise<PaymentPreview> =>
      view("preview_payment", { public_key: key, merchant, amount }, paymentPreview),
  };
}

export type VaultClient = ReturnType<typeof createVaultClient>;

const call = (
  receiverId: AccountId,
  methodName: string,
  args: Record<string, unknown>,
  gas = OWNER_CALL_GAS,
  deposit = "0",
): FunctionCall => ({ receiverId, methodName, args, gas, deposit });

/** One yoctoNEAR, the deposit NEP-171 requires on `nft_transfer`. */
export const ONE_YOCTO = "1";
/** Smallest deposit for `set_card_key`, which becomes the key allowance: 1 NEAR. */
export const MIN_HOLDER_ALLOWANCE = "1000000000000000000000000";

/** Function call descriptors for every vault write. Only the token methods attach a deposit. */
export function vaultCalls(vaultId: AccountId) {
  return {
    pay: (input: { merchant: AccountId; amount: U128; memo?: string; reference?: string }) =>
      call(
        vaultId,
        "pay",
        {
          merchant: input.merchant,
          amount: input.amount,
          memo: input.memo ?? null,
          reference: input.reference ?? null,
        },
        CARD_PAY_GAS,
      ),
    createCard: (input: {
      publicKey: PublicKey;
      label: string;
      kind: CardKind;
      policy: Policy;
      gasAllowance?: U128;
    }) =>
      call(vaultId, "create_card", {
        public_key: input.publicKey,
        label: input.label,
        kind: input.kind,
        policy: input.policy,
        gas_allowance: input.gasAllowance ?? null,
      }),
    updatePolicy: (cardId: number, newPolicy: Policy) =>
      call(vaultId, "update_policy", { card_id: cardId, policy: newPolicy }),
    freezeCard: (cardId: number) => call(vaultId, "freeze_card", { card_id: cardId }),
    unfreezeCard: (cardId: number) => call(vaultId, "unfreeze_card", { card_id: cardId }),
    revokeCard: (cardId: number) => call(vaultId, "revoke_card", { card_id: cardId }),
    rotateCardKey: (cardId: number, newPublicKey: PublicKey, gasAllowance?: U128) =>
      call(vaultId, "rotate_card_key", {
        card_id: cardId,
        new_public_key: newPublicKey,
        gas_allowance: gasAllowance ?? null,
      }),
    /** Hands the card token to `receiverId`; the current card key is deleted. */
    transferCard: (cardId: number, receiverId: AccountId) =>
      call(
        vaultId,
        "nft_transfer",
        { receiver_id: receiverId, token_id: String(cardId), approval_id: null, memo: null },
        OWNER_CALL_GAS,
        ONE_YOCTO,
      ),
    /** Sets the key of a card the caller holds. `allowance` is the attached deposit in yoctoNEAR. */
    setCardKey: (cardId: number, publicKey: PublicKey, allowance = MIN_HOLDER_ALLOWANCE) =>
      call(
        vaultId,
        "set_card_key",
        { card_id: cardId, public_key: publicKey },
        OWNER_CALL_GAS,
        allowance,
      ),
    setApprover: (account: AccountId, maxAmount: U128 | null) =>
      call(vaultId, "set_approver", { account_id: account, max_amount: maxAmount }),
    approvePayment: (paymentId: number) =>
      call(vaultId, "approve_payment", { payment_id: paymentId }, OWNER_ASYNC_CALL_GAS),
    declinePayment: (paymentId: number) =>
      call(vaultId, "decline_payment", { payment_id: paymentId }),
    expirePayment: (paymentId: number) =>
      call(vaultId, "expire_payment", { payment_id: paymentId }),
    /** Releases a payment stuck in the registry check once the approval TTL passed. */
    recoverPayment: (paymentId: number) =>
      call(vaultId, "recover_payment", { payment_id: paymentId }),
    withdraw: (token: AccountId, amount: U128, receiverId: AccountId) =>
      call(vaultId, "withdraw", { token, amount, receiver_id: receiverId }, OWNER_ASYNC_CALL_GAS),
  };
}
