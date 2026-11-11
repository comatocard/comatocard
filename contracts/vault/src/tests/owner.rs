//! Vault initialization, the ledger and ownership.

use super::*;

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
#[should_panic(expected = "insufficient available balance")]
fn withdraw_cannot_touch_reserved_funds() {
    let mut harness = Harness::new();
    harness.pay(40);
    harness.as_account(owner());
    harness.vault.withdraw(token(), U128(970), owner());
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
fn ownership_transfer_needs_both_steps() {
    let mut harness = Harness::new();
    harness.vault.propose_owner(id("dao.near"));
    assert_eq!(harness.vault.get_config().owner, owner());
    harness.as_account(id("dao.near"));
    harness.vault.accept_owner();
    assert_eq!(harness.vault.get_config().owner, id("dao.near"));
    assert!(has_event("owner_changed"));
}
