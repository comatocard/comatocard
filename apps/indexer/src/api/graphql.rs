//! Read-only GraphQL API at `/graphql`: POST runs a query, GET serves the `GraphiQL` explorer.
//!
//! Every field calls the REST handler for the same data, so both APIs share their validation,
//! queries and response shapes. Cards and payments are typed objects; summaries whose shape is
//! specified in `docs/specs/indexer-api.md` are returned as `JSON`.

use std::collections::HashMap;
use std::marker::PhantomData;
use std::sync::Arc;

use async_graphql::http::GraphiQLSource;
use async_graphql::{
    Context, EmptyMutation, EmptySubscription, Json, Object, Schema, SimpleObject,
};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::{Path, Query, State};
use axum::response::{Html, IntoResponse};
use serde_json::Value;

use super::payments::{self, Payment};
use super::vaults::{self, Card};
use super::{ApiError, AppState};
use crate::rpc::Chain;

/// Nesting and cost caps for the public endpoint. The schema has no nested types, so the depth
/// cap only matters for introspection: it fits the query `GraphiQL` sends (about 13 levels)
/// and rejects deeper ones.
const MAX_DEPTH: usize = 16;
const MAX_COMPLEXITY: usize = 1000;

pub type IndexerSchema<C> = Schema<QueryRoot<C>, EmptyMutation, EmptySubscription>;

pub fn schema<C: Chain + 'static>(state: Arc<AppState<C>>) -> IndexerSchema<C> {
    Schema::build(QueryRoot(PhantomData), EmptyMutation, EmptySubscription)
        .data(state)
        .limit_depth(MAX_DEPTH)
        .limit_complexity(MAX_COMPLEXITY)
        .finish()
}

pub async fn execute<C: Chain + 'static>(
    State(schema): State<IndexerSchema<C>>,
    request: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(request.into_inner()).await.into()
}

pub async fn graphiql() -> impl IntoResponse {
    Html(
        GraphiQLSource::build()
            .endpoint("/graphql")
            .title("Comatocard indexer")
            .finish(),
    )
}

pub struct QueryRoot<C>(PhantomData<C>);

/// One page of payments, newest first; pass `nextCursor` back as `cursor` for the next page.
#[derive(SimpleObject, serde::Deserialize)]
pub struct PaymentPage {
    items: Vec<Payment>,
    #[serde(rename = "next_cursor")]
    next_cursor: Option<String>,
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

fn state<C: Chain + 'static>(ctx: &Context<'_>) -> State<Arc<AppState<C>>> {
    State(Arc::clone(ctx.data_unchecked::<Arc<AppState<C>>>()))
}

/// REST query parameters from optional GraphQL arguments.
fn params<const N: usize>(pairs: [(&str, Option<String>); N]) -> Query<HashMap<String, String>> {
    Query(
        pairs
            .into_iter()
            .filter_map(|(key, value)| value.map(|v| (key.to_owned(), v)))
            .collect(),
    )
}

#[Object]
impl<C: Chain + 'static> QueryRoot<C> {
    /// Indexed height, chain height and lag.
    async fn health(&self, ctx: &Context<'_>) -> Json<Value> {
        let state = state::<C>(ctx).0;
        let indexed = state.progress.indexed();
        let chain = state.progress.chain();
        let lag = indexed.zip(chain).map(|(i, c)| {
            i64::try_from(c).unwrap_or(i64::MAX) - i64::try_from(i).unwrap_or(i64::MAX)
        });
        Json(serde_json::json!({
            "status": if indexed.is_some() { "ok" } else { "starting" },
            "indexed_height": indexed,
            "chain_height": chain,
            "lag": lag,
        }))
    }

    /// Vaults owned by `owner`.
    async fn vaults(&self, ctx: &Context<'_>, owner: String) -> async_graphql::Result<Json<Value>> {
        let body = vaults::list(state::<C>(ctx), params([("owner", Some(owner))])).await?;
        Ok(Json(body.0))
    }

    /// One vault: owner, code version, card count, today's spend and indexed balances.
    async fn vault(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Json<Value>> {
        Ok(Json(vaults::summary(state::<C>(ctx), Path(id)).await?.0))
    }

    /// Cards of a vault, by card id.
    async fn cards(&self, ctx: &Context<'_>, vault: String) -> async_graphql::Result<Vec<Card>> {
        Ok(vaults::cards(state::<C>(ctx), Path(vault)).await?.0)
    }

    /// Card tokens held by `holder` across vaults; a card without a holder belongs to the owner.
    async fn cards_by_holder(
        &self,
        ctx: &Context<'_>,
        holder: String,
    ) -> async_graphql::Result<Vec<Card>> {
        let query = params([("holder", Some(holder))]);
        Ok(vaults::cards_by_holder(state::<C>(ctx), query).await?.0)
    }

    /// Payments of a vault, newest first, with the same filters as the REST route.
    #[expect(clippy::too_many_arguments, reason = "one argument per REST filter")]
    async fn payments(
        &self,
        ctx: &Context<'_>,
        vault: String,
        card: Option<i64>,
        status: Option<String>,
        merchant: Option<String>,
        from: Option<String>,
        to: Option<String>,
        limit: Option<i64>,
        cursor: Option<String>,
    ) -> async_graphql::Result<PaymentPage> {
        let query = params([
            ("card", card.map(|v| v.to_string())),
            ("status", status),
            ("merchant", merchant),
            ("from", from),
            ("to", to),
            ("limit", limit.map(|v| v.to_string())),
            ("cursor", cursor),
        ]);
        let body = payments::list(state::<C>(ctx), Path(vault), query).await?.0;
        Ok(serde_json::from_value(body)?)
    }

    /// One payment with its event history.
    async fn payment(
        &self,
        ctx: &Context<'_>,
        vault: String,
        id: i64,
    ) -> async_graphql::Result<Json<Value>> {
        let path = Path((vault, id.to_string()));
        Ok(Json(payments::detail(state::<C>(ctx), path).await?.0))
    }

    /// Queued payments waiting for an approver.
    async fn approvals(
        &self,
        ctx: &Context<'_>,
        vault: String,
    ) -> async_graphql::Result<Json<Value>> {
        Ok(Json(
            payments::approvals(state::<C>(ctx), Path(vault)).await?.0,
        ))
    }

    /// Payments received by a merchant, optionally for one reference.
    async fn merchant_payments(
        &self,
        ctx: &Context<'_>,
        merchant: String,
        reference: Option<String>,
    ) -> async_graphql::Result<Vec<Payment>> {
        let query = params([("reference", reference)]);
        Ok(
            payments::by_merchant(state::<C>(ctx), Path(merchant), query)
                .await?
                .0,
        )
    }

    /// Spend per card, merchant and day.
    async fn analytics(
        &self,
        ctx: &Context<'_>,
        vault: String,
    ) -> async_graphql::Result<Json<Value>> {
        let query = params::<0>([]);
        Ok(Json(
            super::analytics::analytics(state::<C>(ctx), Path(vault), query)
                .await?
                .0,
        ))
    }

    /// Counterparty risk verdict for `account`, optionally as seen by `vault`.
    async fn risk(
        &self,
        ctx: &Context<'_>,
        account: String,
        vault: Option<String>,
    ) -> async_graphql::Result<Json<Value>> {
        let query = params([("vault", vault)]);
        let body = super::risk(state::<C>(ctx), Path(account), query).await?;
        Ok(Json(serde_json::to_value(body.0)?))
    }
}
