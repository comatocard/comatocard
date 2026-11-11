import { z } from "zod";
import { accountId, id, publicKey, u128 } from "./primitives.js";
import {
  cardKind,
  failureCause,
  policy,
  queueCause,
  registryStatus,
  rejectReason,
} from "./types.js";

/** NEP-297 standard name of every Comatocard event. */
export const EVENT_STANDARD = "comatocard";
/** Major version of the event schema this SDK understands. */
export const EVENT_MAJOR_VERSION = 1;
/** Prefix of NEP-297 log lines. */
export const EVENT_LOG_PREFIX = "EVENT_JSON:";

const cardRef = z.strictObject({ card_id: id });
const paymentRef = z.strictObject({ payment_id: id });
const decision = z.strictObject({ payment_id: id, approver_id: accountId });
const ownerRef = z.strictObject({ owner_id: accountId });
const paymentCore = {
  payment_id: id,
  card_id: id,
  merchant: accountId,
  token: accountId,
  amount: u128,
};

/** Data schema of every event, keyed by event name. Mirrors `docs/specs/events.md`. */
export const eventData = {
  vault_code_published: z.strictObject({ code_hash: z.string().min(32), code_version: id }),
  vault_created: z.strictObject({ vault_id: accountId, owner_id: accountId, code_version: id }),
  card_created: z.strictObject({
    card_id: id,
    public_key: publicKey,
    label: z.string(),
    kind: cardKind,
    policy,
  }),
  card_policy_updated: z.strictObject({ card_id: id, policy }),
  card_frozen: cardRef,
  card_unfrozen: cardRef,
  card_revoked: cardRef,
  card_key_rotated: z.strictObject({
    card_id: id,
    old_public_key: publicKey.nullable(),
    new_public_key: publicKey,
  }),
  card_key_rejected: z.strictObject({ card_id: id, public_key: publicKey }),
  card_transferred: z.strictObject({
    card_id: id,
    old_holder: accountId,
    new_holder: accountId,
  }),
  approver_set: z.strictObject({ account_id: accountId, max_amount: u128.nullable() }),
  deposit: z.strictObject({ token: accountId, sender_id: accountId, amount: u128 }),
  withdrawal: z.strictObject({
    token: accountId,
    receiver_id: accountId,
    amount: u128,
    success: z.boolean(),
  }),
  payment_submitted: z.strictObject({
    ...paymentCore,
    memo: z.string().nullable(),
    reference: z.string().nullable(),
  }),
  payment_queued: z.strictObject({
    ...paymentCore,
    memo: z.string().nullable(),
    reference: z.string().nullable(),
    cause: queueCause,
  }),
  payment_approved: decision,
  payment_declined: decision,
  payment_expired: paymentRef,
  payment_settled: z.strictObject({ ...paymentCore, reference: z.string().nullable() }),
  payment_failed: z.strictObject({ ...paymentCore, cause: failureCause }),
  payment_rejected: z.strictObject({
    card_id: id,
    merchant: accountId,
    token: accountId,
    amount: u128,
    reason: rejectReason,
    reference: z.string().nullable(),
  }),
  owner_proposed: ownerRef,
  owner_changed: ownerRef,
  report_submitted: z.strictObject({
    report_id: id,
    account_id: accountId,
    reporter_id: accountId,
    category: z.enum(["scam", "phishing", "drainer", "impersonation", "other", "sanctions"]),
    evidence_uri: z.string().min(1),
  }),
  status_changed: z.strictObject({
    account_id: accountId,
    status: registryStatus,
    curator_id: accountId,
    report_ids: z.array(id),
  }),
} as const;

export type EventName = keyof typeof eventData;

/** A validated Comatocard event: its name, NEP-297 version and the single data object. */
export type ComatocardEvent = {
  [K in EventName]: { event: K; version: string; data: z.infer<(typeof eventData)[K]> };
}[EventName];

export const EVENT_NAMES = Object.keys(eventData) as EventName[];

const envelope = z.strictObject({
  standard: z.literal(EVENT_STANDARD),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  event: z.string(),
  data: z.tuple([z.unknown()]),
});

export type ParseResult =
  | { ok: true; event: ComatocardEvent }
  | { ok: false; reason: "not_an_event" | "other_standard" }
  | { ok: false; reason: "invalid"; error: string };

function isEventName(name: string): name is EventName {
  return Object.hasOwn(eventData, name);
}

/**
 * Parses one log line. Lines without the NEP-297 prefix and events of other standards are
 * skipped; Comatocard events that do not match the schema are reported as invalid so the indexer
 * can dead-letter them.
 */
export function parseEventLog(line: string): ParseResult {
  if (!line.startsWith(EVENT_LOG_PREFIX)) {
    return { ok: false, reason: "not_an_event" };
  }
  let json: unknown;
  try {
    json = JSON.parse(line.slice(EVENT_LOG_PREFIX.length));
  } catch {
    return { ok: false, reason: "invalid", error: "malformed JSON" };
  }
  if (
    typeof json === "object" &&
    json !== null &&
    (json as { standard?: unknown }).standard !== EVENT_STANDARD
  ) {
    return { ok: false, reason: "other_standard" };
  }
  const parsed = envelope.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", error: z.prettifyError(parsed.error) };
  }
  const { event, version, data } = parsed.data;
  if (Number(version.split(".")[0]) !== EVENT_MAJOR_VERSION) {
    return { ok: false, reason: "invalid", error: `unsupported version ${version}` };
  }
  if (!isEventName(event)) {
    return { ok: false, reason: "invalid", error: `unknown event ${event}` };
  }
  const result = eventData[event].safeParse(data[0]);
  if (!result.success) {
    return { ok: false, reason: "invalid", error: `${event}: ${z.prettifyError(result.error)}` };
  }
  return { ok: true, event: { event, version, data: result.data } as ComatocardEvent };
}
