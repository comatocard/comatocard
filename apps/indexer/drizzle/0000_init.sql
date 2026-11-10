CREATE TABLE "account_code" (
	"account_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"first_seen_at" numeric(20, 0) NOT NULL,
	CONSTRAINT "account_code_account_id_code_hash_pk" PRIMARY KEY("account_id","code_hash")
);
--> statement-breakpoint
CREATE TABLE "approvers" (
	"vault_id" text NOT NULL,
	"account_id" text NOT NULL,
	"max_amount" numeric(39, 0) NOT NULL,
	CONSTRAINT "approvers_vault_id_account_id_pk" PRIMARY KEY("vault_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"vault_id" text NOT NULL,
	"card_id" integer NOT NULL,
	"public_key" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" numeric(20, 0) NOT NULL,
	"updated_at" numeric(20, 0) NOT NULL,
	CONSTRAINT "cards_vault_id_card_id_pk" PRIMARY KEY("vault_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"height" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letters" (
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"contract_id" text NOT NULL,
	"line" text NOT NULL,
	"error" text NOT NULL,
	CONSTRAINT "dead_letters_receipt_id_log_index_pk" PRIMARY KEY("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"block_timestamp" numeric(20, 0) NOT NULL,
	"tx_hash" text,
	"contract_id" text NOT NULL,
	"event" text NOT NULL,
	"version" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "events_receipt_id_log_index_pk" PRIMARY KEY("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"payment_id" bigint,
	"card_id" integer NOT NULL,
	"merchant" text NOT NULL,
	"token" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"memo" text,
	"reference" text,
	"status" text NOT NULL,
	"queue_cause" text,
	"reason" text,
	"approver_id" text,
	"origin_receipt_id" text NOT NULL,
	"origin_log_index" integer NOT NULL,
	"tx_hash" text,
	"created_at" numeric(20, 0) NOT NULL,
	"updated_at" numeric(20, 0) NOT NULL,
	"updated_height" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_reports" (
	"registry_id" text NOT NULL,
	"report_id" bigint NOT NULL,
	"account_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"category" text NOT NULL,
	"evidence_uri" text NOT NULL,
	"created_at" numeric(20, 0) NOT NULL,
	CONSTRAINT "registry_reports_registry_id_report_id_pk" PRIMARY KEY("registry_id","report_id")
);
--> statement-breakpoint
CREATE TABLE "registry_statuses" (
	"registry_id" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text NOT NULL,
	"curator_id" text NOT NULL,
	"report_ids" jsonb NOT NULL,
	"updated_at" numeric(20, 0) NOT NULL,
	CONSTRAINT "registry_statuses_registry_id_account_id_pk" PRIMARY KEY("registry_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "token_flows" (
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"vault_id" text NOT NULL,
	"kind" text NOT NULL,
	"token" text NOT NULL,
	"counterparty" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"success" boolean NOT NULL,
	"tx_hash" text,
	"created_at" numeric(20, 0) NOT NULL,
	CONSTRAINT "token_flows_receipt_id_log_index_pk" PRIMARY KEY("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"vault_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"pending_owner_id" text,
	"factory_id" text NOT NULL,
	"code_version" integer NOT NULL,
	"created_height" bigint NOT NULL,
	"created_at" numeric(20, 0) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_contract_height" ON "events" USING btree ("contract_id","block_height");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_vault_payment" ON "payments" USING btree ("vault_id","payment_id") WHERE "payments"."payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_origin" ON "payments" USING btree ("origin_receipt_id","origin_log_index");--> statement-breakpoint
CREATE INDEX "payments_vault_id" ON "payments" USING btree ("vault_id","id");--> statement-breakpoint
CREATE INDEX "payments_merchant" ON "payments" USING btree ("merchant","reference");--> statement-breakpoint
CREATE INDEX "registry_reports_account" ON "registry_reports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "token_flows_vault" ON "token_flows" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "vaults_owner" ON "vaults" USING btree ("owner_id");