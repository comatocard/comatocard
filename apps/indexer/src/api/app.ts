import { accountId as accountIdSchema } from "@comatocard/sdk";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { z } from "zod";
import type { EventBus } from "../bus.js";
import type { Database } from "../db/client.js";
import { approvers, cards, events, payments, tokenFlows, vaults } from "../db/schema.js";
import type { RunnerState } from "../ingest/runner.js";
import type { RiskService } from "../risk/service.js";
import { formatUnits, isoFromNanos, toCsv } from "./csv.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
import { matchesFilter } from "./stream.js";

export interface AppOptions {
  db: Database;
  state: RunnerState;
  risk: RiskService;
  bus: EventBus;
  /** Token decimals for the CSV export; `undefined` when unknown. */
  tokenDecimals: (token: string) => Promise<number | undefined>;
  upgradeWebSocket?: UpgradeWebSocket;
}

const DAY_NS = 86_400n * 1_000_000_000n;
const nanos = z.string().regex(/^\d+$/);
const account = accountIdSchema;
const reservedStatuses = ["submitted", "queued", "approved", "settled"];

const paymentQuery = z.object({
  card: z.coerce.number().int().nonnegative().optional(),
  status: z
    .enum([
      "submitted",
      "queued",
      "approved",
      "declined",
      "expired",
      "settled",
      "failed",
      "rejected",
    ])
    .optional(),
  merchant: account.optional(),
  from: nanos.optional(),
  to: nanos.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type PaymentRow = typeof payments.$inferSelect;

function paymentView(row: PaymentRow) {
  return {
    id: row.id,
    payment_id: row.paymentId,
    vault_id: row.vaultId,
    card_id: row.cardId,
    merchant: row.merchant,
    token: row.token,
    amount: row.amount,
    memo: row.memo,
    reference: row.reference,
    status: row.status,
    queue_cause: row.queueCause,
    reason: row.reason,
    approver_id: row.approverId,
    tx_hash: row.txHash,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function cardView(row: typeof cards.$inferSelect) {
  return {
    vault_id: row.vaultId,
    card_id: row.cardId,
    public_key: row.publicKey,
    holder_id: row.holderId,
    label: row.label,
    kind: row.kind,
    status: row.status,
    policy: row.policy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Builds the HTTP API. Pure wiring over the database, so tests call it with `app.request`. */
export function createApp(options: AppOptions) {
  const { db, state } = options;
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof z.ZodError) {
      return c.json({ error: "invalid request", details: z.treeifyError(error) }, 400);
    }
    return c.json({ error: "internal error" }, 500);
  });
  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.get("/health", (c) => {
    const { indexedHeight, chainHeight } = state;
    const lag =
      indexedHeight !== undefined && chainHeight !== undefined ? chainHeight - indexedHeight : null;
    return c.json({
      status: indexedHeight === undefined ? "starting" : "ok",
      indexed_height: indexedHeight ?? null,
      chain_height: chainHeight ?? null,
      lag,
    });
  });

  app.get("/vaults", async (c) => {
    const owner = account.parse(c.req.query("owner"));
    const rows = await db
      .select()
      .from(vaults)
      .where(eq(vaults.ownerId, owner))
      .orderBy(asc(vaults.createdHeight));
    return c.json(
      rows.map((v) => ({
        vault_id: v.vaultId,
        owner_id: v.ownerId,
        factory_id: v.factoryId,
        code_version: v.codeVersion,
        created_at: v.createdAt,
      })),
    );
  });

  app.get("/vaults/:vault", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const [vault] = await db.select().from(vaults).where(eq(vaults.vaultId, vaultId));
    if (!vault) return c.json({ error: "vault not found" }, 404);

    const flows = await db
      .select({ token: tokenFlows.token, kind: tokenFlows.kind, total: sum(tokenFlows.amount) })
      .from(tokenFlows)
      .where(and(eq(tokenFlows.vaultId, vaultId), eq(tokenFlows.success, true)))
      .groupBy(tokenFlows.token, tokenFlows.kind);
    const spent = await db
      .select({ token: payments.token, status: payments.status, total: sum(payments.amount) })
      .from(payments)
      .where(and(eq(payments.vaultId, vaultId), inArray(payments.status, reservedStatuses)))
      .groupBy(payments.token, payments.status);
    const balances = new Map<string, { in: bigint; out: bigint; reserved: bigint }>();
    const entry = (token: string) => {
      const existing = balances.get(token) ?? { in: 0n, out: 0n, reserved: 0n };
      balances.set(token, existing);
      return existing;
    };
    for (const f of flows) {
      const e = entry(f.token);
      if (f.kind === "deposit") e.in += BigInt(f.total ?? 0);
      else e.out += BigInt(f.total ?? 0);
    }
    for (const s of spent) {
      const e = entry(s.token);
      if (s.status === "settled") e.out += BigInt(s.total ?? 0);
      else e.reserved += BigInt(s.total ?? 0);
    }

    const dayStart = ((BigInt(Date.now()) * 1_000_000n) / DAY_NS) * DAY_NS;
    const [today] = await db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .where(
        and(
          eq(payments.vaultId, vaultId),
          inArray(payments.status, reservedStatuses),
          gte(payments.createdAt, dayStart.toString()),
        ),
      );
    const [cardCount] = await db
      .select({ n: count() })
      .from(cards)
      .where(eq(cards.vaultId, vaultId));

    return c.json({
      vault_id: vault.vaultId,
      owner_id: vault.ownerId,
      pending_owner_id: vault.pendingOwnerId,
      factory_id: vault.factoryId,
      code_version: vault.codeVersion,
      created_at: vault.createdAt,
      card_count: cardCount?.n ?? 0,
      spent_today: today?.total ?? "0",
      indexed_balances: [...balances].map(([token, b]) => ({
        token,
        available: (b.in - b.out - b.reserved).toString(),
        reserved: b.reserved.toString(),
      })),
    });
  });

  // Card tokens held by an account across vaults; a card without a holder belongs to the owner.
  app.get("/cards", async (c) => {
    const holder = account.parse(c.req.query("holder"));
    const rows = await db
      .select({ card: cards })
      .from(cards)
      .innerJoin(vaults, eq(vaults.vaultId, cards.vaultId))
      .where(
        and(
          ne(cards.status, "revoked"),
          or(eq(cards.holderId, holder), and(isNull(cards.holderId), eq(vaults.ownerId, holder))),
        ),
      )
      .orderBy(asc(cards.vaultId), asc(cards.cardId));
    return c.json(rows.map((row) => cardView(row.card)));
  });

  app.get("/vaults/:vault/cards", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const rows = await db
      .select()
      .from(cards)
      .where(eq(cards.vaultId, vaultId))
      .orderBy(asc(cards.cardId));
    return c.json(rows.map(cardView));
  });

  app.get("/vaults/:vault/cards/:card", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const cardId = z.coerce.number().int().nonnegative().parse(c.req.param("card"));
    const [row] = await db
      .select()
      .from(cards)
      .where(and(eq(cards.vaultId, vaultId), eq(cards.cardId, cardId)));
    if (!row) return c.json({ error: "card not found" }, 404);
    const recent = await db
      .select()
      .from(payments)
      .where(and(eq(payments.vaultId, vaultId), eq(payments.cardId, cardId)))
      .orderBy(desc(payments.id))
      .limit(20);
    return c.json({ ...cardView(row), recent_payments: recent.map(paymentView) });
  });

  app.get("/vaults/:vault/payments", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const query = paymentQuery.parse(c.req.query());
    const before = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (query.cursor !== undefined && before === undefined) {
      return c.json({ error: "invalid cursor" }, 400);
    }
    const rows = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.vaultId, vaultId),
          query.card === undefined ? undefined : eq(payments.cardId, query.card),
          query.status === undefined ? undefined : eq(payments.status, query.status),
          query.merchant === undefined ? undefined : eq(payments.merchant, query.merchant),
          query.from === undefined ? undefined : gte(payments.createdAt, query.from),
          query.to === undefined ? undefined : lte(payments.createdAt, query.to),
          before === undefined ? undefined : lt(payments.id, before),
        ),
      )
      .orderBy(desc(payments.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return c.json({
      items: page.map(paymentView),
      next_cursor: rows.length > query.limit && last ? encodeCursor(last.id) : null,
    });
  });

  app.get("/vaults/:vault/payments/:id", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const paymentId = z.coerce.number().int().nonnegative().parse(c.req.param("id"));
    const [row] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.vaultId, vaultId), eq(payments.paymentId, paymentId)));
    if (!row) return c.json({ error: "payment not found" }, 404);
    const history = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.contractId, vaultId),
          sql`${events.data}->>'payment_id' = ${String(paymentId)}`,
        ),
      )
      .orderBy(asc(events.blockHeight), asc(events.logIndex));
    return c.json({
      ...paymentView(row),
      events: history.map((e) => ({
        event: e.event,
        data: e.data,
        block_height: e.blockHeight,
        tx_hash: e.txHash,
        timestamp: e.blockTimestamp,
      })),
    });
  });

  app.get("/vaults/:vault/approvals", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.vaultId, vaultId), eq(payments.status, "queued")))
      .orderBy(asc(payments.id));
    const tiers = await db.select().from(approvers).where(eq(approvers.vaultId, vaultId));
    return c.json({
      items: rows.map(paymentView),
      approvers: tiers.map((a) => ({ account_id: a.accountId, max_amount: a.maxAmount })),
    });
  });

  app.get("/vaults/:vault/export.csv", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const range = z.object({ from: nanos.optional(), to: nanos.optional() }).parse(c.req.query());
    const rows = await db
      .select({ payment: payments, label: cards.label })
      .from(payments)
      .leftJoin(cards, and(eq(cards.vaultId, payments.vaultId), eq(cards.cardId, payments.cardId)))
      .where(
        and(
          eq(payments.vaultId, vaultId),
          range.from === undefined ? undefined : gte(payments.createdAt, range.from),
          range.to === undefined ? undefined : lte(payments.createdAt, range.to),
        ),
      )
      .orderBy(asc(payments.id));
    const decimals = new Map<string, number | undefined>();
    for (const token of new Set(rows.map((r) => r.payment.token))) {
      decimals.set(token, await options.tokenDecimals(token));
    }
    const csv = toCsv(
      [
        "date_utc",
        "card_id",
        "card_label",
        "merchant",
        "token",
        "amount",
        "amount_raw",
        "status",
        "queue_cause",
        "reason",
        "reference",
        "memo",
        "payment_id",
        "transaction_hash",
      ],
      rows.map(({ payment: p, label }) => {
        const d = decimals.get(p.token);
        return [
          isoFromNanos(p.createdAt),
          p.cardId,
          label,
          p.merchant,
          p.token,
          d === undefined ? null : formatUnits(p.amount, d),
          p.amount,
          p.status,
          p.queueCause,
          p.reason,
          p.reference,
          p.memo,
          p.paymentId,
          p.txHash,
        ];
      }),
    );
    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${vaultId}-payments.csv"`,
    });
  });

  app.get("/analytics/:vault", async (c) => {
    const vaultId = account.parse(c.req.param("vault"));
    const range = z.object({ from: nanos.optional(), to: nanos.optional() }).parse(c.req.query());
    const settled = and(
      eq(payments.vaultId, vaultId),
      eq(payments.status, "settled"),
      range.from === undefined ? undefined : gte(payments.createdAt, range.from),
      range.to === undefined ? undefined : lte(payments.createdAt, range.to),
    );
    const day = sql<string>`(${payments.createdAt} / ${DAY_NS.toString()})::bigint`;
    const [byCard, byMerchant, byDay, rejected] = await Promise.all([
      db
        .select({ card_id: payments.cardId, token: payments.token, total: sum(payments.amount) })
        .from(payments)
        .where(settled)
        .groupBy(payments.cardId, payments.token)
        .orderBy(asc(payments.cardId)),
      db
        .select({ merchant: payments.merchant, token: payments.token, total: sum(payments.amount) })
        .from(payments)
        .where(settled)
        .groupBy(payments.merchant, payments.token)
        .orderBy(asc(payments.merchant)),
      db
        .select({ day, token: payments.token, total: sum(payments.amount) })
        .from(payments)
        .where(settled)
        .groupBy(day, payments.token)
        .orderBy(asc(day)),
      db
        .select({ reason: payments.reason, n: count() })
        .from(payments)
        .where(and(eq(payments.vaultId, vaultId), eq(payments.status, "rejected")))
        .groupBy(payments.reason)
        .orderBy(asc(payments.reason)),
    ]);
    return c.json({
      by_card: byCard,
      by_merchant: byMerchant,
      by_day: byDay.map((d) => ({
        date: new Date(Number(d.day) * 86_400_000).toISOString().slice(0, 10),
        token: d.token,
        total: d.total,
      })),
      rejections: rejected.map((r) => ({ reason: r.reason, count: r.n })),
    });
  });

  app.get("/risk/:account", async (c) => {
    const target = account.parse(c.req.param("account"));
    const vault = account.optional().parse(c.req.query("vault"));
    return c.json(await options.risk(target, vault));
  });

  app.get("/merchants/:merchant/payments", async (c) => {
    const merchant = account.parse(c.req.param("merchant"));
    const reference = z.string().min(1).max(64).optional().parse(c.req.query("reference"));
    const rows = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.merchant, merchant),
          reference === undefined ? undefined : eq(payments.reference, reference),
        ),
      )
      .orderBy(desc(payments.id))
      .limit(50);
    return c.json(rows.map(paymentView));
  });

  if (options.upgradeWebSocket) {
    app.get(
      "/stream",
      options.upgradeWebSocket((c) => {
        const filter = {
          vault: c.req.query("vault"),
          merchant: c.req.query("merchant"),
        };
        let unsubscribe = () => {};
        return {
          onOpen: (_event, ws) => {
            unsubscribe = options.bus.subscribe((event) => {
              if (matchesFilter(event, filter)) ws.send(JSON.stringify(event));
            });
          },
          onClose: () => unsubscribe(),
        };
      }),
    );
  }

  return app;
}
