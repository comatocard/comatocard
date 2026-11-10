//! Pure policy evaluation and spend window arithmetic. No NEAR environment access, so every rule
//! is unit tested directly.

use near_sdk::AccountId;

use crate::types::{Card, CardStatus, QueueCause, RejectReason, Spend};

/// Nanoseconds in one UTC day.
pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
/// Nanoseconds in one spend period.
pub const PERIOD_NS: u64 = 30 * DAY_NS;

/// Index of the UTC day containing `now`.
pub const fn day_index(now: u64) -> u64 {
    now / DAY_NS
}

/// Index of the 30-day period containing `now`.
pub const fn period_index(now: u64) -> u64 {
    now / PERIOD_NS
}

/// Spend in the windows containing `now`, treating stale counters as zero.
pub fn current_spend(spend: Spend, now: u64) -> (u128, u128) {
    let day = if spend.day == day_index(now) {
        spend.day_spent.0
    } else {
        0
    };
    let period = if spend.period == period_index(now) {
        spend.period_spent.0
    } else {
        0
    };
    (day, period)
}

/// Adds `amount` to the windows containing `now`, resetting stale counters.
pub fn add_spend(spend: Spend, amount: u128, now: u64) -> Spend {
    let (day, period) = current_spend(spend, now);
    Spend {
        day: day_index(now),
        day_spent: (day + amount).into(),
        period: period_index(now),
        period_spent: (period + amount).into(),
    }
}

/// Removes `amount` from the windows it was counted in. Windows that have since rolled over are
/// left untouched, because their counters were already reset.
pub fn remove_spend(spend: Spend, amount: u128, day: u64, period: u64) -> Spend {
    let mut next = spend;
    if next.day == day {
        next.day_spent = next.day_spent.0.saturating_sub(amount).into();
    }
    if next.period == period {
        next.period_spent = next.period_spent.0.saturating_sub(amount).into();
    }
    next
}

/// A payment that passed every synchronous check.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Execute,
    Queue(QueueCause),
}

/// Inputs of a payment evaluation that come from the vault state.
#[derive(Clone, Copy, Debug)]
pub struct Context {
    pub now: u64,
    pub token_accepted: bool,
    pub available: u128,
}

/// Evaluates a payment against the card and its policy, in the order documented in the spec.
///
/// # Errors
/// Returns the first rule the payment violates.
pub fn evaluate(
    card: &Card,
    merchant: &AccountId,
    amount: u128,
    ctx: Context,
) -> Result<Verdict, RejectReason> {
    let policy = &card.policy;
    match card.status {
        CardStatus::Active => {}
        CardStatus::Frozen => return Err(RejectReason::CardFrozen),
        CardStatus::Revoked => return Err(RejectReason::CardRevoked),
    }
    if policy.valid_from.is_some_and(|from| ctx.now < from.0) {
        return Err(RejectReason::CardNotYetValid);
    }
    if policy.expires_at.is_some_and(|until| ctx.now >= until.0) {
        return Err(RejectReason::CardExpired);
    }
    if !ctx.token_accepted {
        return Err(RejectReason::TokenNotAccepted);
    }
    if amount == 0 {
        return Err(RejectReason::AmountZero);
    }
    if !policy.merchants.permits(merchant) {
        return Err(RejectReason::MerchantNotAllowed);
    }
    if amount > policy.per_tx_limit.0 {
        return Err(RejectReason::PerTxLimit);
    }
    let (day_spent, period_spent) = current_spend(card.spend, ctx.now);
    if day_spent.saturating_add(amount) > policy.daily_limit.0 {
        return Err(RejectReason::DailyLimit);
    }
    if period_spent.saturating_add(amount) > policy.monthly_limit.0 {
        return Err(RejectReason::MonthlyLimit);
    }
    if amount > ctx.available {
        return Err(RejectReason::InsufficientBalance);
    }
    if policy
        .approval_threshold
        .is_some_and(|threshold| amount > threshold.0)
    {
        return Ok(Verdict::Queue(QueueCause::Threshold));
    }
    Ok(Verdict::Execute)
}

#[cfg(test)]
mod tests {
    use near_sdk::json_types::{U64, U128};

    use super::*;
    use crate::types::{CardKind, MerchantRule, Policy, RiskMode};

    const NOW: u64 = 1_800_000_000 * 1_000_000_000;

    fn shop() -> AccountId {
        "shop.near".parse().unwrap()
    }

    fn card() -> Card {
        Card {
            id: 0,
            label: "agent".to_owned(),
            kind: CardKind::Agent,
            public_key: Some(
                "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
                    .parse()
                    .unwrap(),
            ),
            holder: None,
            status: CardStatus::Active,
            policy: Policy {
                token: "usd.near".parse().unwrap(),
                per_tx_limit: U128(100),
                daily_limit: U128(150),
                monthly_limit: U128(400),
                approval_threshold: Some(U128(50)),
                merchants: MerchantRule::Any,
                valid_from: None,
                expires_at: None,
                risk_mode: RiskMode::Off,
            },
            spend: Spend::default(),
            created_at: U64(0),
        }
    }

    fn ctx() -> Context {
        Context {
            now: NOW,
            token_accepted: true,
            available: 1_000,
        }
    }

    fn eval(card: &Card, amount: u128) -> Result<Verdict, RejectReason> {
        evaluate(card, &shop(), amount, ctx())
    }

    #[test]
    fn small_payment_executes_and_large_payment_queues() {
        assert_eq!(eval(&card(), 50), Ok(Verdict::Execute));
        assert_eq!(eval(&card(), 51), Ok(Verdict::Queue(QueueCause::Threshold)));
    }

    #[test]
    fn no_threshold_never_queues() {
        let mut c = card();
        c.policy.approval_threshold = None;
        assert_eq!(eval(&c, 100), Ok(Verdict::Execute));
    }

    #[test]
    fn status_is_checked_first() {
        let mut c = card();
        c.status = CardStatus::Frozen;
        assert_eq!(eval(&c, 0), Err(RejectReason::CardFrozen));
        c.status = CardStatus::Revoked;
        assert_eq!(eval(&c, 0), Err(RejectReason::CardRevoked));
    }

    #[test]
    fn validity_window_is_inclusive_start_exclusive_end() {
        let mut c = card();
        c.policy.valid_from = Some(U64(NOW + 1));
        assert_eq!(eval(&c, 10), Err(RejectReason::CardNotYetValid));
        c.policy.valid_from = Some(U64(NOW));
        assert_eq!(eval(&c, 10), Ok(Verdict::Execute));
        c.policy.expires_at = Some(U64(NOW));
        assert_eq!(eval(&c, 10), Err(RejectReason::CardExpired));
        c.policy.expires_at = Some(U64(NOW + 1));
        assert_eq!(eval(&c, 10), Ok(Verdict::Execute));
    }

    #[test]
    fn token_amount_and_merchant_rules() {
        let c = card();
        let mut no_token = ctx();
        no_token.token_accepted = false;
        assert_eq!(
            evaluate(&c, &shop(), 10, no_token),
            Err(RejectReason::TokenNotAccepted)
        );
        assert_eq!(eval(&c, 0), Err(RejectReason::AmountZero));

        let mut c = card();
        c.policy.merchants = MerchantRule::Allow(vec!["other.near".parse().unwrap()]);
        assert_eq!(eval(&c, 10), Err(RejectReason::MerchantNotAllowed));
        c.policy.merchants = MerchantRule::Deny(vec![shop()]);
        assert_eq!(eval(&c, 10), Err(RejectReason::MerchantNotAllowed));
    }

    #[test]
    fn limits_are_hard_ceilings() {
        let c = card();
        assert_eq!(eval(&c, 101), Err(RejectReason::PerTxLimit));

        let mut c = card();
        c.spend = add_spend(c.spend, 100, NOW);
        assert_eq!(eval(&c, 50), Ok(Verdict::Execute));
        assert_eq!(eval(&c, 51), Err(RejectReason::DailyLimit));

        let mut c = card();
        c.spend = Spend {
            day: day_index(NOW),
            day_spent: U128(0),
            period: period_index(NOW),
            period_spent: U128(350),
        };
        assert_eq!(eval(&c, 50), Ok(Verdict::Execute));
        assert_eq!(eval(&c, 51), Err(RejectReason::MonthlyLimit));
    }

    #[test]
    fn balance_is_checked_after_limits() {
        let c = card();
        let mut poor = ctx();
        poor.available = 20;
        assert_eq!(
            evaluate(&c, &shop(), 30, poor),
            Err(RejectReason::InsufficientBalance)
        );
        assert_eq!(
            evaluate(&c, &shop(), 101, poor),
            Err(RejectReason::PerTxLimit)
        );
    }

    #[test]
    fn spend_windows_roll_over() {
        let spend = add_spend(Spend::default(), 100, NOW);
        assert_eq!(current_spend(spend, NOW), (100, 100));
        let next_day = NOW + DAY_NS;
        let (day, _) = current_spend(spend, next_day);
        assert_eq!(day, 0);
        assert_eq!(current_spend(spend, NOW + PERIOD_NS), (0, 0));
        let after = add_spend(spend, 30, next_day);
        assert_eq!(after.day_spent.0, 30);
    }

    #[test]
    fn remove_spend_only_touches_original_windows() {
        let spend = add_spend(Spend::default(), 100, NOW);
        let released = remove_spend(spend, 40, day_index(NOW), period_index(NOW));
        assert_eq!(current_spend(released, NOW), (60, 60));

        let next_day = NOW + DAY_NS;
        let rolled = add_spend(spend, 10, next_day);
        let released = remove_spend(rolled, 100, day_index(NOW), period_index(NOW));
        assert_eq!(released.day_spent.0, 10);
    }

    #[test]
    fn remove_spend_saturates() {
        let spend = add_spend(Spend::default(), 10, NOW);
        let released = remove_spend(spend, 50, day_index(NOW), period_index(NOW));
        assert_eq!(current_spend(released, NOW), (0, 0));
    }
}
