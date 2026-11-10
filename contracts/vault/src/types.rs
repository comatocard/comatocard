//! Data types shared by storage, the JSON interface and events.

use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, PublicKey, near};

/// Identifier of a card, assigned by the vault and never reused.
pub type CardId = u32;

/// Identifier of a stored payment request, assigned by the vault and never reused.
pub type PaymentId = u64;

/// Maximum byte length of a card label.
pub const MAX_LABEL_LEN: usize = 64;
/// Maximum byte length of a payment memo.
pub const MAX_MEMO_LEN: usize = 256;
/// Maximum byte length of a payment reference.
pub const MAX_REFERENCE_LEN: usize = 64;
/// Maximum number of accounts in a merchant allow or deny list.
pub const MAX_MERCHANT_RULE_LEN: usize = 50;

/// Who holds the card. Informational: every kind follows the same policy rules.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    Human,
    Agent,
    Treasury,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CardStatus {
    Active,
    Frozen,
    Revoked,
}

/// Which merchants a card may pay.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MerchantRule {
    Any,
    Allow(Vec<AccountId>),
    Deny(Vec<AccountId>),
}

impl MerchantRule {
    /// Whether `merchant` passes this rule.
    pub fn permits(&self, merchant: &AccountId) -> bool {
        match self {
            Self::Any => true,
            Self::Allow(list) => list.contains(merchant),
            Self::Deny(list) => !list.contains(merchant),
        }
    }

    fn len(&self) -> usize {
        match self {
            Self::Any => 0,
            Self::Allow(list) | Self::Deny(list) => list.len(),
        }
    }
}

/// How a card uses the counterparty registry.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RiskMode {
    /// The registry is not consulted.
    Off,
    /// Payments to blocked accounts fail.
    BlockOnly,
    /// Payments to blocked accounts fail; payments to flagged accounts wait for approval.
    Strict,
}

/// Status of an account in the counterparty registry.
#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegistryStatus {
    Clear,
    Flagged,
    Blocked,
}

/// Spending rules of a card. Limits are hard ceilings; the approval threshold is soft.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Policy {
    /// Settlement token; must be accepted by the vault.
    pub token: AccountId,
    pub per_tx_limit: U128,
    /// Limit per fixed UTC day.
    pub daily_limit: U128,
    /// Limit per fixed 30-day period counted from the Unix epoch.
    pub monthly_limit: U128,
    /// Payments above this amount wait for approval. `None` disables queuing.
    pub approval_threshold: Option<U128>,
    pub merchants: MerchantRule,
    pub valid_from: Option<U64>,
    pub expires_at: Option<U64>,
    pub risk_mode: RiskMode,
}

impl Policy {
    /// Checks internal consistency.
    ///
    /// # Errors
    /// Returns a static description of the first violated rule.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.per_tx_limit.0 == 0 {
            return Err("per_tx_limit must be positive");
        }
        if self.per_tx_limit.0 > self.daily_limit.0 {
            return Err("per_tx_limit must not exceed daily_limit");
        }
        if self.daily_limit.0 > self.monthly_limit.0 {
            return Err("daily_limit must not exceed monthly_limit");
        }
        if let Some(threshold) = self.approval_threshold
            && threshold.0 >= self.per_tx_limit.0
        {
            return Err("approval_threshold must be below per_tx_limit");
        }
        if let (Some(from), Some(until)) = (self.valid_from, self.expires_at)
            && from.0 >= until.0
        {
            return Err("valid_from must be before expires_at");
        }
        if self.merchants.len() > MAX_MERCHANT_RULE_LEN {
            return Err("merchant list is too long");
        }
        Ok(())
    }
}

/// Spend counted in the current day and period. Counters reset when the window index changes.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Spend {
    pub day: u64,
    pub day_spent: U128,
    pub period: u64,
    pub period_spent: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Card {
    pub id: CardId,
    pub label: String,
    pub kind: CardKind,
    pub public_key: PublicKey,
    pub status: CardStatus,
    pub policy: Policy,
    pub spend: Spend,
    pub created_at: U64,
}

/// Why a payment was rejected. Serialized in snake case in events.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RejectReason {
    CardFrozen,
    CardRevoked,
    CardNotYetValid,
    CardExpired,
    TokenNotAccepted,
    AmountZero,
    MerchantNotAllowed,
    PerTxLimit,
    DailyLimit,
    MonthlyLimit,
    InsufficientBalance,
}

/// Why a payment waits for approval.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueCause {
    Threshold,
    RiskFlagged,
}

/// Why an accepted payment did not settle.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureCause {
    TransferFailed,
    MerchantBlocked,
    RegistryUnavailable,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PaymentStatus {
    /// Waiting for an approver or the owner.
    Queued,
    /// Waiting for the registry answer.
    Checking,
    /// Token transfer in flight.
    Transferring,
}

/// A payment that passed the policy checks and holds a reservation until it reaches a terminal
/// state.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payment {
    pub id: PaymentId,
    pub card_id: CardId,
    pub merchant: AccountId,
    pub token: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
    pub reference: Option<String>,
    pub status: PaymentStatus,
    pub queue_cause: Option<QueueCause>,
    /// Set once an approver or the owner approved a queued payment.
    pub approved_by: Option<AccountId>,
    pub created_at: U64,
    /// Spend windows the reservation was counted in.
    pub day: u64,
    pub period: u64,
}

/// Result of `pay`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PaymentDecision {
    /// Accepted; the final result arrives as `payment_settled` or `payment_failed`.
    Submitted {
        payment_id: PaymentId,
    },
    /// Waiting for approval.
    Queued {
        payment_id: PaymentId,
        cause: QueueCause,
    },
    Rejected {
        reason: RejectReason,
    },
}

/// Result of `preview_payment`, a dry run without the registry call.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PaymentPreview {
    Allowed,
    NeedsApproval { cause: QueueCause },
    Rejected { reason: RejectReason },
}

/// Ledger entry of one token.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TokenBalance {
    pub accepted: bool,
    pub available: U128,
    pub reserved: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenBalanceView {
    pub token: AccountId,
    pub accepted: bool,
    pub available: U128,
    pub reserved: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApproverView {
    pub account_id: AccountId,
    pub max_amount: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VaultConfig {
    pub owner: AccountId,
    pub pending_owner: Option<AccountId>,
    pub factory: Option<AccountId>,
    pub registry: Option<AccountId>,
    pub approval_ttl: U64,
    pub contract_version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> Policy {
        Policy {
            token: "usd.near".parse().unwrap(),
            per_tx_limit: U128(100),
            daily_limit: U128(200),
            monthly_limit: U128(1_000),
            approval_threshold: Some(U128(50)),
            merchants: MerchantRule::Any,
            valid_from: None,
            expires_at: None,
            risk_mode: RiskMode::Off,
        }
    }

    #[test]
    fn valid_policy_passes() {
        assert_eq!(policy().validate(), Ok(()));
    }

    #[test]
    fn policy_rejects_inconsistent_limits() {
        let mut p = policy();
        p.per_tx_limit = U128(0);
        assert!(p.validate().is_err());

        let mut p = policy();
        p.per_tx_limit = U128(300);
        assert_eq!(
            p.validate(),
            Err("per_tx_limit must not exceed daily_limit")
        );

        let mut p = policy();
        p.daily_limit = U128(2_000);
        assert_eq!(
            p.validate(),
            Err("daily_limit must not exceed monthly_limit")
        );

        let mut p = policy();
        p.approval_threshold = Some(U128(100));
        assert_eq!(
            p.validate(),
            Err("approval_threshold must be below per_tx_limit")
        );
    }

    #[test]
    fn policy_rejects_empty_validity_window_and_long_lists() {
        let mut p = policy();
        p.valid_from = Some(U64(10));
        p.expires_at = Some(U64(10));
        assert_eq!(p.validate(), Err("valid_from must be before expires_at"));

        let mut p = policy();
        let merchant: AccountId = "shop.near".parse().unwrap();
        p.merchants = MerchantRule::Allow(vec![merchant; MAX_MERCHANT_RULE_LEN + 1]);
        assert_eq!(p.validate(), Err("merchant list is too long"));
    }

    #[test]
    fn merchant_rule_permits() {
        let shop: AccountId = "shop.near".parse().unwrap();
        let other: AccountId = "other.near".parse().unwrap();
        assert!(MerchantRule::Any.permits(&shop));
        assert!(MerchantRule::Allow(vec![shop.clone()]).permits(&shop));
        assert!(!MerchantRule::Allow(vec![shop.clone()]).permits(&other));
        assert!(!MerchantRule::Deny(vec![shop.clone()]).permits(&shop));
        assert!(MerchantRule::Deny(vec![shop]).permits(&other));
    }
}
