//! Contract-level unit tests with a mocked blockchain. Asynchronous results are simulated by
//! calling the callbacks with explicit promise results.

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::json_types::{U64, U128};
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{AccountId, NearToken, PromiseError, PublicKey, testing_env};

use crate::types::{
    CardKind, CardStatus, MerchantRule, PaymentDecision, PaymentPreview, PaymentStatus, Policy,
    QueueCause, RegistryStatus, RejectReason, RiskMode,
};
use crate::{MIN_HOLDER_ALLOWANCE, Vault};

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

fn agent() -> AccountId {
    id("agent.near")
}

impl Harness {
    fn with_deposit(&mut self, account: AccountId, deposit: NearToken) {
        testing_env!(
            self.context
                .predecessor_account_id(account)
                .attached_deposit(deposit)
                .build()
        );
    }

    fn transfer(&mut self, from: AccountId, to: AccountId) {
        self.with_deposit(from, NearToken::from_yoctonear(1));
        self.vault.nft_transfer(to, "0".to_owned(), None, None);
    }
}

#[test]
fn every_card_is_a_token_of_the_owner() {
    let harness = Harness::new();
    assert!(has_event("nft_mint"));
    let token = harness.vault.nft_token("0".to_owned()).unwrap();
    assert_eq!(token.owner_id, owner());
    assert_eq!(
        token.metadata.and_then(|m| m.title).as_deref(),
        Some("research agent")
    );
    assert_eq!(harness.vault.nft_total_supply().0, 1);
    assert_eq!(harness.vault.nft_supply_for_owner(owner()).0, 1);
    assert_eq!(harness.vault.nft_tokens(None, None).len(), 1);
    assert!(harness.vault.nft_token("7".to_owned()).is_none());
}

#[test]
fn transfer_removes_the_key_until_the_holder_sets_one() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    assert!(has_event("card_transferred") && has_event("nft_transfer"));
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(agent()));
    assert_eq!(
        harness.vault.nft_tokens_for_owner(agent(), None, None)[0].token_id,
        "0"
    );
    assert_eq!(harness.vault.nft_supply_for_owner(owner()).0, 0);

    harness.with_deposit(agent(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
    assert!(has_event("card_key_rotated"));
    harness.as_card(other_key());
    assert!(matches!(
        harness.vault.pay(shop(), U128(10), None, None),
        PaymentDecision::Submitted { .. }
    ));
}

#[test]
fn transfer_back_to_the_owner_follows_ownership() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.transfer(agent(), owner());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, None);
    assert_eq!(
        harness.vault.nft_token("0".to_owned()).unwrap().owner_id,
        owner()
    );
}

#[test]
#[should_panic(expected = "only the card holder may transfer the card")]
fn strangers_cannot_transfer() {
    let mut harness = Harness::new();
    harness.transfer(agent(), shop());
}

#[test]
#[should_panic(expected = "only the card holder may transfer the card")]
fn owner_cannot_take_back_a_transferred_card() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.transfer(owner(), shop());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfer_requires_one_yocto() {
    let mut harness = Harness::new();
    harness
        .vault
        .nft_transfer(agent(), "0".to_owned(), None, None);
}

#[test]
#[should_panic(expected = "attach at least 1 NEAR as the key allowance")]
fn holder_pays_the_key_allowance() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(agent(), NearToken::from_millinear(999));
    harness.vault.set_card_key(0, other_key());
}

#[test]
#[should_panic(expected = "only the card holder may set the key")]
fn only_the_holder_sets_the_key() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(shop(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
}

#[test]
fn revoke_burns_a_transferred_card() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(owner(), NearToken::from_yoctonear(0));
    harness.vault.revoke_card(0);
    assert!(has_event("nft_burn"));
    assert!(harness.vault.nft_token("0".to_owned()).is_none());
    assert_eq!(harness.vault.nft_total_supply().0, 0);
}

#[test]
fn issue_49_transfer_declines_queued_payments() {
    let mut harness = Harness::new();
    let PaymentDecision::Submitted {
        payment_id: in_flight,
    } = harness.pay(10)
    else {
        panic!("small payment should be submitted");
    };
    let PaymentDecision::Queued {
        payment_id: queued, ..
    } = harness.pay(60)
    else {
        panic!("large payment should be queued");
    };
    harness.transfer(owner(), agent());
    assert!(has_event("payment_declined"));
    assert!(harness.vault.get_payment(queued).is_none());
    assert!(harness.vault.get_payment(in_flight).is_some());
    assert_eq!(harness.reserved(), 10);
    assert_eq!(harness.day_spent(), 10);
}

fn resolve(harness: &mut Harness, result: near_sdk::PromiseResult) -> bool {
    use near_contract_standards::non_fungible_token::core::NonFungibleTokenResolver;
    testing_env!(
        harness
            .context
            .predecessor_account_id(vault_id())
            .attached_deposit(NearToken::from_yoctonear(0))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![result]
    );
    harness
        .vault
        .nft_resolve_transfer(owner(), agent(), "0".to_owned(), None)
}

#[test]
fn transfer_call_keeps_the_token_when_the_receiver_accepts() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    let accepted = near_sdk::PromiseResult::Successful(b"false".to_vec());
    assert!(resolve(&mut harness, accepted));
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(agent()));
}

#[test]
fn transfer_call_returns_the_token_when_the_receiver_refuses_or_fails() {
    for result in [
        near_sdk::PromiseResult::Successful(b"true".to_vec()),
        near_sdk::PromiseResult::Failed,
    ] {
        let mut harness = Harness::new();
        harness.with_deposit(owner(), NearToken::from_yoctonear(1));
        let _ = harness
            .vault
            .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
        assert!(!resolve(&mut harness, result));
        let card = harness.vault.get_card(0).unwrap();
        assert_eq!(card.holder, None);
        assert_eq!(card.public_key, None, "the handed over key stays deleted");
    }
}

#[test]
fn returned_token_drops_the_key_the_receiver_set_meanwhile() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    harness.with_deposit(agent(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
    let PaymentDecision::Queued { payment_id, .. } = ({
        harness.as_card(other_key());
        harness.vault.pay(shop(), U128(60), None, None)
    }) else {
        panic!("large payment should be queued");
    };
    assert!(!resolve(
        &mut harness,
        near_sdk::PromiseResult::Successful(b"true".to_vec())
    ));
    assert!(harness.vault.get_card_by_key(other_key()).is_none());
    assert!(harness.vault.get_payment(payment_id).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, None);
}

#[test]
fn resolve_keeps_a_token_the_receiver_already_passed_on() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    harness.transfer(agent(), shop());
    assert!(resolve(&mut harness, near_sdk::PromiseResult::Failed));
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(shop()));
}

#[test]
#[should_panic(expected = "approvals are not supported")]
fn approvals_are_rejected() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    harness
        .vault
        .nft_transfer(agent(), "0".to_owned(), Some(1), None);
}

#[test]
fn metadata_follows_nep_177() {
    use near_contract_standards::non_fungible_token::metadata::NonFungibleTokenMetadataProvider;
    let harness = Harness::new();
    let metadata = harness.vault.nft_metadata();
    metadata.assert_valid();
    assert_eq!(metadata.spec, "nft-1.0.0");
    let token = harness.vault.nft_token("0".to_owned()).unwrap();
    token.metadata.unwrap().assert_valid();
}

#[test]
#[should_panic(expected = "attach at least 80 Tgas")]
fn issue_58_pay_requires_gas_for_every_callback() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    testing_env!(
        harness
            .context
            .predecessor_account_id(vault_id())
            .signer_account_pk(card_key())
            .prepaid_gas(near_sdk::Gas::from_tgas(50))
            .build()
    );
    harness.vault.pay(shop(), U128(10), None, None);
}

#[test]
fn issue_58_a_stuck_registry_check_is_recovered_after_the_ttl() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    assert_eq!(harness.reserved(), 10);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.as_account(shop());
    harness.vault.recover_payment(0);
    assert!(harness.vault.get_payment(0).is_none());
    assert_eq!((harness.available(), harness.reserved()), (1_000, 0));
    assert_eq!(harness.day_spent(), 0);
}

#[test]
#[should_panic(expected = "approval time has not run out yet")]
fn issue_58_recovery_waits_for_the_ttl() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    harness.vault.recover_payment(0);
}

#[test]
#[should_panic(expected = "only a payment stuck in the registry check can be recovered")]
fn issue_58_a_transfer_in_flight_is_never_recovered() {
    let mut harness = Harness::new();
    harness.pay(10);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.recover_payment(0);
}

#[test]
fn issue_59_a_key_the_account_already_has_is_unmapped_and_kept() {
    let mut harness = Harness::new();
    harness.as_account(vault_id());
    harness
        .vault
        .on_card_key_added(0, card_key(), Err(PromiseError::Failed));
    assert!(has_event("card_key_rejected"));
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().public_key, None);
    // A later rotation must not delete the key the vault never added.
    harness.as_account(owner());
    harness.vault.rotate_card_key(0, other_key(), None);
    assert_eq!(
        near_sdk::test_utils::get_created_receipts()
            .iter()
            .flat_map(|r| r.actions.iter())
            .filter(|a| matches!(a, near_sdk::mock::MockAction::DeleteKey { .. }))
            .count(),
        0
    );
}

#[test]
fn issue_59_a_confirmed_key_stays_mapped() {
    let mut harness = Harness::new();
    harness.as_account(vault_id());
    harness.vault.on_card_key_added(0, card_key(), Ok(()));
    assert!(!has_event("card_key_rejected"));
    assert_eq!(harness.vault.get_card_by_key(card_key()).unwrap().id, 0);
}

#[test]
fn issue_59_a_late_failure_for_a_replaced_key_changes_nothing() {
    let mut harness = Harness::new();
    harness.vault.rotate_card_key(0, other_key(), None);
    harness.as_account(vault_id());
    harness
        .vault
        .on_card_key_added(0, card_key(), Err(PromiseError::Failed));
    assert_eq!(harness.vault.get_card_by_key(other_key()).unwrap().id, 0);
}

/// A harness whose card queues every payment above 1 unit.
fn queueing() -> Harness {
    let mut harness = Harness::new();
    let mut eager = policy();
    eager.approval_threshold = Some(U128(1));
    eager.daily_limit = U128(1_000);
    harness.vault.update_policy(0, eager);
    harness
}

#[test]
fn issue_60_a_card_queues_at_most_ten_payments() {
    let mut harness = queueing();
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
    }
    assert_eq!(
        harness.pay(2),
        PaymentDecision::Rejected {
            reason: RejectReason::QueueFull
        }
    );
    assert_eq!(
        harness.reserved(),
        20,
        "the rejected payment reserved nothing"
    );
    // Settling the queue frees a slot.
    harness.as_account(owner());
    harness.vault.decline_payment(0);
    assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
}

#[test]
fn issue_60_every_way_out_of_the_queue_frees_its_slot() {
    let mut harness = queueing();
    for _ in 0..3 {
        harness.pay(2);
    }
    harness.as_account(owner());
    harness.vault.approve_payment(0);
    harness.vault.decline_payment(1);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.expire_payment(2);
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
    }
}

#[test]
fn issue_60_a_handover_declines_only_this_cards_queue() {
    let mut harness = queueing();
    harness.vault.create_card(
        other_key(),
        "second".to_owned(),
        CardKind::Agent,
        policy(),
        None,
    );
    harness.pay(2);
    harness.as_card(other_key());
    let PaymentDecision::Queued {
        payment_id: other, ..
    } = harness.vault.pay(shop(), U128(60), None, None)
    else {
        panic!("second card queues above its threshold");
    };
    harness.transfer(owner(), agent());
    assert!(harness.vault.get_payment(0).is_none());
    assert!(harness.vault.get_payment(other).is_some());
}

#[test]
fn issue_60_a_strict_requeue_into_a_full_queue_fails_the_payment() {
    let mut harness = queueing();
    let mut strict = harness.vault.get_card(0).unwrap().policy;
    strict.risk_mode = RiskMode::Strict;
    strict.approval_threshold = Some(U128(5));
    harness.vault.update_policy(0, strict);
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        harness.pay(6);
    }
    let PaymentDecision::Submitted { payment_id } = harness.pay(3) else {
        panic!("a small payment goes to the registry");
    };
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(payment_id, false, Ok(RegistryStatus::Flagged));
    assert!(harness.vault.get_payment(payment_id).is_none());
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"queue_full\""))
    );
}

#[test]
fn issue_61_risk_mode_without_a_registry_fails_closed() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.vault.set_registry(None);
    harness.pay(10);
    assert!(harness.vault.get_payment(0).is_none());
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"registry_unavailable\""))
    );
    assert_eq!((harness.available(), harness.reserved()), (1_000, 0));
}

fn queued_payment() -> Harness {
    let mut harness = Harness::new();
    assert!(matches!(harness.pay(60), PaymentDecision::Queued { .. }));
    harness.as_account(owner());
    harness
}

#[test]
#[should_panic(expected = "approval time ran out, expire the payment instead")]
fn issue_63_approval_respects_the_ttl() {
    let mut harness = queued_payment();
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "card is outside its validity window")]
fn issue_63_approval_respects_the_validity_window() {
    let mut harness = queued_payment();
    let mut expiring = policy();
    expiring.expires_at = Some(U64(NOW + 1));
    harness.vault.update_policy(0, expiring);
    harness.at(NOW + 1);
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "merchant is no longer allowed")]
fn issue_63_approval_respects_the_merchant_rule() {
    let mut harness = queued_payment();
    let mut deny = policy();
    deny.merchants = MerchantRule::Deny(vec![shop()]);
    harness.vault.update_policy(0, deny);
    harness.vault.approve_payment(0);
}
