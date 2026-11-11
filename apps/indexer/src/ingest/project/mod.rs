//! Applies one validated event to the projections. Called inside the transaction that stores the
//! raw event, and only when the raw event was new, so replays never double count.

mod cards;
mod ledger;
mod payments;
mod registry;
mod vaults;

use sqlx::PgConnection;

use crate::events::EventData;

/// Where an event was recorded.
#[derive(Debug, Clone)]
pub struct Origin {
    pub contract_id: String,
    pub receipt_id: String,
    pub log_index: u32,
    pub block_height: u64,
    pub block_timestamp: String,
    pub tx_hash: Option<String>,
}

impl Origin {
    pub(super) fn height(&self) -> i64 {
        i64::try_from(self.block_height).unwrap_or(i64::MAX)
    }
}

pub(super) fn int(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

/// Routes each event to the projection of its domain. The match is exhaustive, so a new event
/// type cannot be forgotten.
pub async fn project(
    db: &mut PgConnection,
    origin: &Origin,
    event: &EventData,
) -> sqlx::Result<()> {
    use EventData as E;
    match event {
        E::VaultCodePublished(_)
        | E::VaultCreated(_)
        | E::OwnerProposed(_)
        | E::OwnerChanged(_)
        | E::ApproverSet(_) => vaults::apply(db, origin, event).await,
        E::CardCreated(_)
        | E::CardPolicyUpdated(_)
        | E::CardFrozen(_)
        | E::CardUnfrozen(_)
        | E::CardRevoked(_)
        | E::CardKeyRotated(_)
        | E::CardTransferred(_)
        | E::CardKeyRejected(_) => cards::apply(db, origin, event).await,
        E::Deposit(_) | E::Withdrawal(_) => ledger::apply(db, origin, event).await,
        E::PaymentSubmitted(_)
        | E::PaymentQueued(_)
        | E::PaymentApproved(_)
        | E::PaymentDeclined(_)
        | E::PaymentExpired(_)
        | E::PaymentSettled(_)
        | E::PaymentFailed(_)
        | E::PaymentRejected(_) => payments::apply(db, origin, event).await,
        E::ReportSubmitted(_) | E::StatusChanged(_) => registry::apply(db, origin, event).await,
    }
}
