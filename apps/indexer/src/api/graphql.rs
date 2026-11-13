//! Read-only GraphQL API at `/graphql`: POST runs a query, GET serves the `GraphiQL` explorer.
//!
//! Every field calls the REST handler for the same data, so both APIs share their validation,
//! queries and response shapes. Entities are typed and nest like a subgraph: a vault has its
//! cards, payments, approvals and analytics; a card its vault, policy and payments; a payment
//! its card, vault and event history.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::{
    ComplexObject, Context, EmptyMutation, EmptySubscription, Object, Schema, SimpleObject,
};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::{Path, Query, State};
use axum::response::{Html, IntoResponse};
use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::payments::{self, Payment};
use super::vaults::{self, Card};
use super::{ApiError, ApiResult, AppState};
use crate::rpc::Chain;

/// Nesting and cost caps for the public endpoint. They fit the introspection query `GraphiQL`
/// sends (about 13 levels) and a vault expanded down to its payments' cards.
const MAX_DEPTH: usize = 16;
const MAX_COMPLEXITY: usize = 1000;

pub type IndexerSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

pub fn schema<C: Chain + 'static>(state: Arc<AppState<C>>) -> IndexerSchema {
    let backend: Arc<dyn Backend> = Arc::new(Handlers(state));
    Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
        .data(backend)
        .limit_depth(MAX_DEPTH)
        .limit_complexity(MAX_COMPLEXITY)
        .finish()
}

pub async fn execute(
    State(schema): State<IndexerSchema>,
    request: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(request.into_inner()).await.into()
}

/// The `GraphiQL` explorer, opened on the query list with an example over the testnet demo vault.
const GRAPHIQL: &str = include_str!("graphiql.html");

pub async fn graphiql() -> impl IntoResponse {
    Html(GRAPHIQL)
}

impl From<ApiError> for async_graphql::Error {
    fn from(error: ApiError) -> Self {
        match error {
            ApiError::BadRequest(details) => Self::new(format!("invalid request: {details}")),
            ApiError::NotFound(what) => Self::new(what),
            ApiError::Internal(error) => {
                tracing::error!(%error, "graphql request failed");
                Self::new("internal error")
            }
        }
    }
}

type Params = HashMap<String, String>;

/// The REST handlers behind a trait object, so the GraphQL types need not be generic over the
/// chain client.
trait Backend: Send + Sync {
    fn health(&self) -> Health;
    fn vaults(&self, owner: String) -> BoxFuture<'_, ApiResult<Value>>;
    fn vault(&self, vault: String) -> BoxFuture<'_, ApiResult<Value>>;
    fn cards(&self, vault: String) -> BoxFuture<'_, ApiResult<Vec<Card>>>;
    fn card(&self, vault: String, card: i32) -> BoxFuture<'_, ApiResult<Value>>;
    fn cards_by_holder(&self, holder: String) -> BoxFuture<'_, ApiResult<Vec<Card>>>;
    fn payments(&self, vault: String, params: Params) -> BoxFuture<'_, ApiResult<Value>>;
    fn payment(&self, vault: String, id: i64) -> BoxFuture<'_, ApiResult<Value>>;
    fn approvals(&self, vault: String) -> BoxFuture<'_, ApiResult<Value>>;
    fn merchant_payments(
        &self,
        merchant: String,
        params: Params,
    ) -> BoxFuture<'_, ApiResult<Vec<Payment>>>;
    fn analytics(&self, vault: String, params: Params) -> BoxFuture<'_, ApiResult<Value>>;
    fn risk(&self, account: String, params: Params) -> BoxFuture<'_, ApiResult<Value>>;
}

struct Handlers<C>(Arc<AppState<C>>);

impl<C> Handlers<C> {
    fn state(&self) -> State<Arc<AppState<C>>> {
        State(Arc::clone(&self.0))
    }
}

impl<C: Chain + 'static> Backend for Handlers<C> {
    fn health(&self) -> Health {
        let indexed = self
            .0
            .progress
            .indexed()
            .and_then(|h| i64::try_from(h).ok());
        let chain = self.0.progress.chain().and_then(|h| i64::try_from(h).ok());
        Health {
            status: if indexed.is_some() { "ok" } else { "starting" }.to_owned(),
            indexed_height: indexed,
            chain_height: chain,
            lag: indexed.zip(chain).map(|(i, c)| c - i),
        }
    }

    fn vaults(&self, owner: String) -> BoxFuture<'_, ApiResult<Value>> {
        let query = Query(HashMap::from([("owner".to_owned(), owner)]));
        Box::pin(async move { Ok(vaults::list(self.state(), query).await?.0) })
    }

    fn vault(&self, vault: String) -> BoxFuture<'_, ApiResult<Value>> {
        Box::pin(async move { Ok(vaults::summary(self.state(), Path(vault)).await?.0) })
    }

    fn cards(&self, vault: String) -> BoxFuture<'_, ApiResult<Vec<Card>>> {
        Box::pin(async move { Ok(vaults::cards(self.state(), Path(vault)).await?.0) })
    }

    fn card(&self, vault: String, card: i32) -> BoxFuture<'_, ApiResult<Value>> {
        let path = Path((vault, card.to_string()));
        Box::pin(async move { Ok(vaults::card(self.state(), path).await?.0) })
    }

    fn cards_by_holder(&self, holder: String) -> BoxFuture<'_, ApiResult<Vec<Card>>> {
        let query = Query(HashMap::from([("holder".to_owned(), holder)]));
        Box::pin(async move { Ok(vaults::cards_by_holder(self.state(), query).await?.0) })
    }

    fn payments(&self, vault: String, params: Params) -> BoxFuture<'_, ApiResult<Value>> {
        Box::pin(async move {
            Ok(payments::list(self.state(), Path(vault), Query(params))
                .await?
                .0)
        })
    }

    fn payment(&self, vault: String, id: i64) -> BoxFuture<'_, ApiResult<Value>> {
        let path = Path((vault, id.to_string()));
        Box::pin(async move { Ok(payments::detail(self.state(), path).await?.0) })
    }

    fn approvals(&self, vault: String) -> BoxFuture<'_, ApiResult<Value>> {
        Box::pin(async move { Ok(payments::approvals(self.state(), Path(vault)).await?.0) })
    }

    fn merchant_payments(
        &self,
        merchant: String,
        params: Params,
    ) -> BoxFuture<'_, ApiResult<Vec<Payment>>> {
        Box::pin(async move {
            Ok(
                payments::by_merchant(self.state(), Path(merchant), Query(params))
                    .await?
                    .0,
            )
        })
    }

    fn analytics(&self, vault: String, params: Params) -> BoxFuture<'_, ApiResult<Value>> {
        Box::pin(async move {
            Ok(
                super::analytics::analytics(self.state(), Path(vault), Query(params))
                    .await?
                    .0,
            )
        })
    }

    fn risk(&self, account: String, params: Params) -> BoxFuture<'_, ApiResult<Value>> {
        Box::pin(async move {
            let assessment = super::risk(self.state(), Path(account), Query(params))
                .await?
                .0;
            serde_json::to_value(assessment).map_err(|e| ApiError::Internal(e.to_string()))
        })
    }
}

fn backend<'a>(ctx: &Context<'a>) -> &'a Arc<dyn Backend> {
    ctx.data_unchecked::<Arc<dyn Backend>>()
}

/// A REST response body as the typed GraphQL object it describes.
fn decode<T: DeserializeOwned>(value: Value) -> async_graphql::Result<T> {
    serde_json::from_value(value).map_err(|e| {
        tracing::error!(error = %e, "graphql could not decode a REST response");
        async_graphql::Error::new("internal error")
    })
}

/// REST query parameters from optional GraphQL arguments.
fn params<const N: usize>(pairs: [(&str, Option<String>); N]) -> Params {
    pairs
        .into_iter()
        .filter_map(|(key, value)| value.map(|v| (key.to_owned(), v)))
        .collect()
}

/// Filters of a payment page; `card` is set by `Card.payments`.
#[derive(Default)]
struct PaymentFilter {
    card: Option<i32>,
    status: Option<String>,
    merchant: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<i64>,
    cursor: Option<String>,
}

async fn payment_page(
    ctx: &Context<'_>,
    vault: String,
    filter: PaymentFilter,
) -> async_graphql::Result<PaymentPage> {
    let query = params([
        ("card", filter.card.map(|v| v.to_string())),
        ("status", filter.status),
        ("merchant", filter.merchant),
        ("from", filter.from),
        ("to", filter.to),
        ("limit", filter.limit.map(|v| v.to_string())),
        ("cursor", filter.cursor),
    ]);
    decode(backend(ctx).payments(vault, query).await?)
}

async fn vault_by_id(ctx: &Context<'_>, vault: String) -> async_graphql::Result<Vault> {
    decode(backend(ctx).vault(vault).await?)
}

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Indexed height, chain height and lag.
    async fn health(&self, ctx: &Context<'_>) -> Health {
        backend(ctx).health()
    }

    /// Vaults owned by `owner`, oldest first.
    async fn vaults(&self, ctx: &Context<'_>, owner: String) -> async_graphql::Result<Vec<Vault>> {
        let list: Vec<VaultRef> = decode(backend(ctx).vaults(owner).await?)?;
        let mut vaults = Vec::with_capacity(list.len());
        for item in list {
            vaults.push(vault_by_id(ctx, item.vault_id).await?);
        }
        Ok(vaults)
    }

    /// One vault with its cards, payments, approvals and analytics.
    async fn vault(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Vault> {
        vault_by_id(ctx, id).await
    }

    /// Cards of a vault, by card id.
    async fn cards(&self, ctx: &Context<'_>, vault: String) -> async_graphql::Result<Vec<Card>> {
        Ok(backend(ctx).cards(vault).await?)
    }

    /// One card of a vault.
    async fn card(&self, ctx: &Context<'_>, vault: String, id: i32) -> async_graphql::Result<Card> {
        decode(backend(ctx).card(vault, id).await?)
    }

    /// Card tokens held by `holder` across vaults; a card without a holder belongs to the owner.
    async fn cards_by_holder(
        &self,
        ctx: &Context<'_>,
        holder: String,
    ) -> async_graphql::Result<Vec<Card>> {
        Ok(backend(ctx).cards_by_holder(holder).await?)
    }

    /// Payments of a vault, newest first; pass `nextCursor` back as `cursor` for the next page.
    #[expect(clippy::too_many_arguments, reason = "one argument per REST filter")]
    async fn payments(
        &self,
        ctx: &Context<'_>,
        vault: String,
        card: Option<i32>,
        status: Option<String>,
        merchant: Option<String>,
        from: Option<String>,
        to: Option<String>,
        limit: Option<i64>,
        cursor: Option<String>,
    ) -> async_graphql::Result<PaymentPage> {
        let filter = PaymentFilter {
            card,
            status,
            merchant,
            from,
            to,
            limit,
            cursor,
        };
        payment_page(ctx, vault, filter).await
    }

    /// One payment by its vault payment id, with its event history.
    async fn payment(
        &self,
        ctx: &Context<'_>,
        vault: String,
        id: i64,
    ) -> async_graphql::Result<Payment> {
        decode(backend(ctx).payment(vault, id).await?)
    }

    /// Queued payments waiting for an approver, and the vault's approvers.
    async fn approvals(
        &self,
        ctx: &Context<'_>,
        vault: String,
    ) -> async_graphql::Result<Approvals> {
        decode(backend(ctx).approvals(vault).await?)
    }

    /// Payments received by a merchant, optionally for one reference.
    async fn merchant_payments(
        &self,
        ctx: &Context<'_>,
        merchant: String,
        reference: Option<String>,
    ) -> async_graphql::Result<Vec<Payment>> {
        Ok(backend(ctx)
            .merchant_payments(merchant, params([("reference", reference)]))
            .await?)
    }

    /// Settled spend per card, merchant and day, and rejections per reason.
    async fn analytics(
        &self,
        ctx: &Context<'_>,
        vault: String,
        from: Option<String>,
        to: Option<String>,
    ) -> async_graphql::Result<Analytics> {
        decode(
            backend(ctx)
                .analytics(vault, params([("from", from), ("to", to)]))
                .await?,
        )
    }

    /// Counterparty risk verdict for `account`, optionally as seen by `vault`.
    async fn risk(
        &self,
        ctx: &Context<'_>,
        account: String,
        vault: Option<String>,
    ) -> async_graphql::Result<RiskAssessment> {
        decode(
            backend(ctx)
                .risk(account, params([("vault", vault)]))
                .await?,
        )
    }
}

#[derive(SimpleObject)]
pub struct Health {
    status: String,
    indexed_height: Option<i64>,
    chain_height: Option<i64>,
    lag: Option<i64>,
}

#[derive(Deserialize)]
struct VaultRef {
    vault_id: String,
}

/// A vault created by the factory, with its indexed balances.
#[derive(SimpleObject, Deserialize)]
#[graphql(complex)]
#[expect(
    clippy::struct_field_names,
    reason = "field names are the REST response keys"
)]
pub struct Vault {
    vault_id: String,
    owner_id: String,
    pending_owner_id: Option<String>,
    factory_id: String,
    code_version: i32,
    created_at: String,
    card_count: i64,
    /// Settled and reserved spend since the start of the UTC day, in the token's smallest unit.
    spent_today: String,
    indexed_balances: Vec<Balance>,
}

#[ComplexObject]
impl Vault {
    async fn cards(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Card>> {
        Ok(backend(ctx).cards(self.vault_id.clone()).await?)
    }

    #[expect(clippy::too_many_arguments, reason = "one argument per REST filter")]
    async fn payments(
        &self,
        ctx: &Context<'_>,
        card: Option<i32>,
        status: Option<String>,
        merchant: Option<String>,
        from: Option<String>,
        to: Option<String>,
        limit: Option<i64>,
        cursor: Option<String>,
    ) -> async_graphql::Result<PaymentPage> {
        let filter = PaymentFilter {
            card,
            status,
            merchant,
            from,
            to,
            limit,
            cursor,
        };
        payment_page(ctx, self.vault_id.clone(), filter).await
    }

    async fn approvals(&self, ctx: &Context<'_>) -> async_graphql::Result<Approvals> {
        decode(backend(ctx).approvals(self.vault_id.clone()).await?)
    }

    async fn analytics(
        &self,
        ctx: &Context<'_>,
        from: Option<String>,
        to: Option<String>,
    ) -> async_graphql::Result<Analytics> {
        let query = params([("from", from), ("to", to)]);
        decode(backend(ctx).analytics(self.vault_id.clone(), query).await?)
    }
}

#[derive(SimpleObject, Deserialize)]
pub struct Balance {
    token: String,
    available: String,
    reserved: String,
}

/// A card's spending policy; amounts are in the token's smallest unit, times in nanoseconds.
#[derive(SimpleObject, Deserialize)]
pub struct Policy {
    token: String,
    per_tx_limit: String,
    daily_limit: String,
    monthly_limit: String,
    approval_threshold: Option<String>,
    /// `"any"`, `{ "allow": [...] }` or `{ "deny": [...] }`.
    merchants: Value,
    valid_from: Option<String>,
    expires_at: Option<String>,
    risk_mode: String,
}

#[ComplexObject]
impl Card {
    #[expect(clippy::unused_async, reason = "ComplexObject resolvers must be async")]
    async fn policy(&self) -> async_graphql::Result<Policy> {
        decode(self.policy.clone())
    }

    async fn vault(&self, ctx: &Context<'_>) -> async_graphql::Result<Vault> {
        vault_by_id(ctx, self.vault_id.clone()).await
    }

    /// Payments made with this card, newest first.
    async fn payments(
        &self,
        ctx: &Context<'_>,
        status: Option<String>,
        limit: Option<i64>,
        cursor: Option<String>,
    ) -> async_graphql::Result<PaymentPage> {
        let filter = PaymentFilter {
            card: Some(self.card_id),
            status,
            limit,
            cursor,
            ..PaymentFilter::default()
        };
        payment_page(ctx, self.vault_id.clone(), filter).await
    }
}

#[ComplexObject]
impl Payment {
    async fn card(&self, ctx: &Context<'_>) -> async_graphql::Result<Card> {
        decode(
            backend(ctx)
                .card(self.vault_id.clone(), self.card_id)
                .await?,
        )
    }

    async fn vault(&self, ctx: &Context<'_>) -> async_graphql::Result<Vault> {
        vault_by_id(ctx, self.vault_id.clone()).await
    }

    /// The vault events of this payment in block order; empty for a rejected attempt, which has
    /// no vault payment id.
    async fn events(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<PaymentEvent>> {
        let Some(id) = self.payment_id else {
            return Ok(Vec::new());
        };
        let detail: PaymentDetail = decode(backend(ctx).payment(self.vault_id.clone(), id).await?)?;
        Ok(detail.events)
    }
}

#[derive(Deserialize)]
struct PaymentDetail {
    events: Vec<PaymentEvent>,
}

#[derive(SimpleObject, Deserialize)]
pub struct PaymentEvent {
    event: String,
    data: Value,
    block_height: i64,
    tx_hash: Option<String>,
    timestamp: String,
}

/// One page of payments, newest first; pass `nextCursor` back as `cursor` for the next page.
#[derive(SimpleObject, Deserialize)]
pub struct PaymentPage {
    items: Vec<Payment>,
    next_cursor: Option<String>,
}

#[derive(SimpleObject, Deserialize)]
pub struct Approvals {
    /// Queued payments, oldest first.
    items: Vec<Payment>,
    approvers: Vec<Approver>,
}

#[derive(SimpleObject, Deserialize)]
pub struct Approver {
    account_id: String,
    max_amount: String,
}

#[derive(SimpleObject, Deserialize)]
pub struct Analytics {
    by_card: Vec<CardTotal>,
    by_merchant: Vec<MerchantTotal>,
    by_day: Vec<DayTotal>,
    rejections: Vec<RejectionCount>,
}

#[derive(SimpleObject, Deserialize)]
pub struct CardTotal {
    card_id: i32,
    token: String,
    total: String,
}

#[derive(SimpleObject, Deserialize)]
pub struct MerchantTotal {
    merchant: String,
    token: String,
    total: String,
}

#[derive(SimpleObject, Deserialize)]
pub struct DayTotal {
    date: String,
    token: String,
    total: String,
}

#[derive(SimpleObject, Deserialize)]
pub struct RejectionCount {
    reason: Option<String>,
    count: i64,
}

/// Counterparty risk: `allow`, `warn` or `block`, with the reasons and the signals behind them.
#[derive(SimpleObject, Deserialize)]
pub struct RiskAssessment {
    account_id: String,
    verdict: String,
    reasons: Vec<RiskReason>,
    signals: RiskSignals,
}

#[derive(SimpleObject, Deserialize)]
pub struct RiskReason {
    code: String,
    level: String,
    detail: String,
}

#[derive(SimpleObject, Deserialize)]
pub struct RiskSignals {
    registry_status: String,
    report_count: i64,
    exists: Option<bool>,
    is_contract: Option<bool>,
    code_changed_at: Option<String>,
    prior_payments: Option<i64>,
    first_paid_at: Option<String>,
    sanctions_lists: Vec<String>,
}
