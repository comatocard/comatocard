//! Contract-level unit tests with a mocked blockchain. Asynchronous results are simulated by
//! calling the callbacks with explicit promise results.

use near_sdk::json_types::{U64, U128};
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{AccountId, PromiseError, PublicKey, testing_env};

use crate::Vault;
use crate::types::{
    CardKind, CardStatus, MerchantRule, PaymentDecision, PaymentPreview, PaymentStatus, Policy,
    QueueCause, RegistryStatus, RejectReason, RiskMode,
};

const NOW: u64 = 1_800_000_000 * 1_000_000_000;

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn vault_id() -> AccountId {
    id("vault.near")
}
fn owner() -> AccountId {
    id("owner.near")
}
fn token() -> AccountId {
    id("usd.near")
}
fn shop() -> AccountId {
    id("shop.near")
}
fn registry() -> AccountId {
    id("registry.near")
}

fn card_key() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
        .parse()
        .unwrap()
}
fn other_key() -> PublicKey {
    "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847"
        .parse()
        .unwrap()
}

fn policy() -> Policy {
    Policy {
        token: token(),
        per_tx_limit: U128(100),
        daily_limit: U128(150),
        monthly_limit: U128(1_000),
        approval_threshold: Some(U128(50)),
        merchants: MerchantRule::Any,
        valid_from: None,
        expires_at: None,
        risk_mode: RiskMode::Off,
    }
}

struct Harness {
    vault: Vault,
    context: VMContextBuilder,
}

impl Harness {
    fn new() -> Self {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(vault_id())
            .predecessor_account_id(owner())
            .block_timestamp(NOW);
        testing_env!(context.build());
        let vault = Vault::new(owner(), vec![token()], Some(registry()), None);
        let mut harness = Self { vault, context };
        harness.as_account(token());
        harness
            .vault
            .ft_on_transfer(owner(), U128(1_000), String::new())
            .ok();
        harness.as_account(owner());
        harness.vault.create_card(
            card_key(),
            "research agent".to_owned(),
            CardKind::Agent,
            policy(),
            None,
        );
        harness
    }

    fn as_account(&mut self, account: AccountId) {
        testing_env!(self.context.predecessor_account_id(account).build());
    }

    fn as_card(&mut self, key: PublicKey) {
        testing_env!(
            self.context
                .predecessor_account_id(vault_id())
                .signer_account_pk(key)
                .build()
        );
    }

    fn at(&mut self, timestamp: u64) {
        testing_env!(self.context.block_timestamp(timestamp).build());
    }

    fn pay(&mut self, amount: u128) -> PaymentDecision {
        self.as_card(card_key());
        self.vault
            .pay(shop(), U128(amount), None, Some("inv-1".to_owned()))
    }

    fn available(&self) -> u128 {
        self.vault.get_balances()[0].available.0
    }

    fn reserved(&self) -> u128 {
        self.vault.get_balances()[0].reserved.0
    }

    fn day_spent(&self) -> u128 {
        self.vault.get_card(0).unwrap().spend.day_spent.0
    }
}

trait PromiseOrValueExt {
    fn ok(self);
}

impl PromiseOrValueExt for near_sdk::PromiseOrValue<U128> {
    fn ok(self) {
        match self {
            near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 0),
            near_sdk::PromiseOrValue::Promise(_) => panic!("unexpected promise"),
        }
    }
}

fn has_event(name: &str) -> bool {
    let needle = format!("\"event\":\"{name}\"");
    get_logs().iter().any(|log| log.contains(&needle))
}

#[test]
fn init_records_factory_only_when_called_by_another_account() {
    let harness = Harness::new();
    assert_eq!(harness.vault.get_config().factory, None);

    let mut context = VMContextBuilder::new();
    context
        .current_account_id(vault_id())
        .predecessor_account_id(id("factory.near"));
    testing_env!(context.build());
    let vault = Vault::new(owner(), vec![], None, Some(U64(5)));
    let config = vault.get_config();
    assert_eq!(config.factory, Some(id("factory.near")));
    assert_eq!(config.approval_ttl.0, 5);
}

#[test]
fn deposits_credit_accepted_tokens_and_refund_others() {
    let mut harness = Harness::new();
    assert_eq!(harness.available(), 1_000);
    harness.as_account(id("other-token.near"));
    match harness
        .vault
        .ft_on_transfer(owner(), U128(7), String::new())
    {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 7),
        near_sdk::PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

#[test]
#[should_panic(expected = "only the owner may call this method")]
fn create_card_is_owner_only() {
    let mut harness = Harness::new();
    harness.as_account(shop());
    harness
        .vault
        .create_card(other_key(), "x".to_owned(), CardKind::Human, policy(), None);
}

#[test]
#[should_panic(expected = "public key already belongs to a card")]
fn create_card_rejects_duplicate_key() {
    let mut harness = Harness::new();
    harness.vault.create_card(
        card_key(),
        "dup".to_owned(),
        CardKind::Human,
        policy(),
        None,
    );
}

#[test]
#[should_panic(expected = "approval_threshold must be below per_tx_limit")]
fn create_card_validates_policy() {
    let mut harness = Harness::new();
    let mut bad = policy();
    bad.approval_threshold = Some(U128(100));
    harness
        .vault
        .create_card(other_key(), "bad".to_owned(), CardKind::Human, bad, None);
}

#[test]
#[should_panic(expected = "pay must be signed with a card key")]
fn pay_requires_the_vault_as_predecessor() {
    let mut harness = Harness::new();
    harness.as_account(owner());
    harness.vault.pay(shop(), U128(10), None, None);
}

#[test]
#[should_panic(expected = "signer key is not a card")]
fn pay_requires_a_card_key() {
    let mut harness = Harness::new();
    harness.as_card(other_key());
    harness.vault.pay(shop(), U128(10), None, None);
}

#[test]
fn small_payment_reserves_then_settles() {
    let mut harness = Harness::new();
    let decision = harness.pay(40);
    assert_eq!(decision, PaymentDecision::Submitted { payment_id: 0 });
    assert!(has_event("payment_submitted"));
    assert_eq!(harness.available(), 960);
    assert_eq!(harness.reserved(), 40);
    assert_eq!(harness.day_spent(), 40);
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );

    harness.as_account(vault_id());
    harness.vault.on_payment_transferred(0, Ok(()));
    assert!(has_event("payment_settled"));
    assert_eq!(harness.available(), 960);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 40);
    assert!(harness.vault.get_payment(0).is_none());
}

#[test]
fn failed_transfer_releases_funds_and_spend() {
    let mut harness = Harness::new();
    harness.pay(40);
    harness.as_account(vault_id());
    harness
        .vault
        .on_payment_transferred(0, Err(PromiseError::Failed));
    assert!(has_event("payment_failed"));
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 0);
}

#[test]
fn rejection_is_recorded_without_state_change() {
    let mut harness = Harness::new();
    let decision = harness.pay(101);
    assert_eq!(
        decision,
        PaymentDecision::Rejected {
            reason: RejectReason::PerTxLimit
        }
    );
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"reason\":\"per_tx_limit\""))
    );
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.day_spent(), 0);
    assert!(harness.vault.list_payments(None, None).is_empty());
}

#[test]
fn concurrent_reservations_cannot_exceed_the_daily_limit() {
    let mut harness = Harness::new();
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert_eq!(
        harness.pay(1),
        PaymentDecision::Rejected {
            reason: RejectReason::DailyLimit
        }
    );
}

#[test]
fn frozen_card_is_rejected_until_unfrozen() {
    let mut harness = Harness::new();
    harness.vault.freeze_card(0);
    assert_eq!(
        harness.pay(10),
        PaymentDecision::Rejected {
            reason: RejectReason::CardFrozen
        }
    );
    harness.as_account(owner());
    harness.vault.unfreeze_card(0);
    assert!(matches!(harness.pay(10), PaymentDecision::Submitted { .. }));
}

#[test]
fn revoked_card_key_no_longer_resolves() {
    let mut harness = Harness::new();
    harness.vault.revoke_card(0);
    assert!(has_event("card_revoked"));
    assert_eq!(
        harness.vault.get_card(0).unwrap().status,
        CardStatus::Revoked
    );
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
}

#[test]
fn rotated_key_replaces_the_old_key() {
    let mut harness = Harness::new();
    harness.vault.rotate_card_key(0, other_key(), None);
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card_by_key(other_key()).unwrap().id, 0);
    harness.as_card(other_key());
    assert!(matches!(
        harness.vault.pay(shop(), U128(10), None, None),
        PaymentDecision::Submitted { .. }
    ));
}

#[test]
fn large_payment_queues_and_approver_within_limit_approves() {
    let mut harness = Harness::new();
    harness
        .vault
        .set_approver(id("council.near"), Some(U128(80)));
    let decision = harness.pay(60);
    assert_eq!(
        decision,
        PaymentDecision::Queued {
            payment_id: 0,
            cause: QueueCause::Threshold
        }
    );
    assert_eq!(harness.reserved(), 60);

    harness.as_account(id("council.near"));
    harness.vault.approve_payment(0);
    assert!(has_event("payment_approved"));
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}

#[test]
#[should_panic(expected = "amount exceeds the approver limit")]
fn approver_cannot_exceed_its_limit() {
    let mut harness = Harness::new();
    harness
        .vault
        .set_approver(id("council.near"), Some(U128(55)));
    harness.pay(60);
    harness.as_account(id("council.near"));
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "only the owner or an approver may decide")]
fn strangers_cannot_approve() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "card is not active")]
fn queued_payment_of_frozen_card_cannot_be_approved() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(owner());
    harness.vault.freeze_card(0);
    harness.vault.approve_payment(0);
}

#[test]
fn decline_releases_the_reservation() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(owner());
    harness.vault.decline_payment(0);
    assert!(has_event("payment_declined"));
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 0);
}

#[test]
#[should_panic(expected = "approval time has not run out yet")]
fn expire_waits_for_the_ttl() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.vault.expire_payment(0);
}

#[test]
fn anyone_can_expire_after_the_ttl() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.expire_payment(0);
    assert!(has_event("payment_expired"));
    assert_eq!(harness.available(), 1_000);
}

fn with_risk_mode(mode: RiskMode) -> Harness {
    let mut harness = Harness::new();
    let mut risky = policy();
    risky.risk_mode = mode;
    harness.vault.update_policy(0, risky);
    harness
}

#[test]
fn risk_mode_routes_through_the_registry() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Checking
    );
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Clear));
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}

#[test]
fn blocked_merchant_fails_and_releases() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Blocked));
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"merchant_blocked\""))
    );
    assert_eq!(harness.available(), 1_000);
    assert!(harness.vault.get_payment(0).is_none());
}

#[test]
fn registry_failure_fails_closed() {
    let mut harness = with_risk_mode(RiskMode::Strict);
    harness.pay(10);
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Err(PromiseError::Failed));
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"registry_unavailable\""))
    );
    assert_eq!(harness.available(), 1_000);
}

#[test]
fn flagged_merchant_queues_in_strict_mode_only() {
    let mut strict = with_risk_mode(RiskMode::Strict);
    strict.pay(10);
    strict.as_account(vault_id());
    strict
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Flagged));
    let payment = strict.vault.get_payment(0).unwrap();
    assert_eq!(payment.status, PaymentStatus::Queued);
    assert_eq!(payment.queue_cause, Some(QueueCause::RiskFlagged));

    strict.as_account(owner());
    strict.vault.approve_payment(0);
    strict.as_account(vault_id());
    strict
        .vault
        .on_registry_checked(0, true, Ok(RegistryStatus::Flagged));
    assert_eq!(
        strict.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );

    let mut block_only = with_risk_mode(RiskMode::BlockOnly);
    block_only.pay(10);
    block_only.as_account(vault_id());
    block_only
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Flagged));
    assert_eq!(
        block_only.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}

#[test]
fn preview_matches_pay_without_side_effects() {
    let mut harness = Harness::new();
    let preview = |h: &Harness, amount| h.vault.preview_payment(card_key(), shop(), U128(amount));
    assert_eq!(preview(&harness, 10), PaymentPreview::Allowed);
    assert_eq!(
        preview(&harness, 60),
        PaymentPreview::NeedsApproval {
            cause: QueueCause::Threshold
        }
    );
    assert_eq!(
        preview(&harness, 101),
        PaymentPreview::Rejected {
            reason: RejectReason::PerTxLimit
        }
    );
    harness.as_account(owner());
    assert_eq!(harness.available(), 1_000);
}

#[test]
fn withdraw_restores_balance_when_transfer_fails() {
    let mut harness = Harness::new();
    harness.vault.withdraw(token(), U128(300), owner());
    assert_eq!(harness.available(), 700);
    harness.as_account(vault_id());
    harness
        .vault
        .on_withdraw_transferred(token(), U128(300), owner(), Err(PromiseError::Failed));
    assert_eq!(harness.available(), 1_000);
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"success\":false"))
    );
}

#[test]
#[should_panic(expected = "insufficient available balance")]
fn withdraw_cannot_touch_reserved_funds() {
    let mut harness = Harness::new();
    harness.pay(40);
    harness.as_account(owner());
    harness.vault.withdraw(token(), U128(970), owner());
}

#[test]
fn ownership_transfer_needs_both_steps() {
    let mut harness = Harness::new();
    harness.vault.propose_owner(id("dao.near"));
    assert_eq!(harness.vault.get_config().owner, owner());
    harness.as_account(id("dao.near"));
    harness.vault.accept_owner();
    assert_eq!(harness.vault.get_config().owner, id("dao.near"));
    assert!(has_event("owner_changed"));
}

#[test]
#[should_panic(expected = "only the proposed owner may accept")]
fn ownership_cannot_be_taken() {
    let mut harness = Harness::new();
    harness.vault.propose_owner(id("dao.near"));
    harness.as_account(shop());
    harness.vault.accept_owner();
}

#[test]
fn spend_resets_on_a_new_day() {
    let mut harness = Harness::new();
    harness.pay(50);
    harness.pay(50);
    harness.pay(50);
    harness.at(NOW + crate::policy::DAY_NS);
    assert_eq!(harness.day_spent(), 0);
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
}
