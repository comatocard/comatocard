//! Contract-level unit tests with a mocked blockchain.
use near_sdk::PromiseError;
#[cfg(test)]
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::testing_env;

use super::*;

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn setup() -> (Factory, VMContextBuilder) {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id(id("factory.near"))
        .predecessor_account_id(id("owner.near"));
    testing_env!(context.build());
    (
        Factory::new(id("owner.near"), vec![id("usd.near")], None),
        context,
    )
}

fn with_input(context: &VMContextBuilder, input: &[u8]) -> near_sdk::VMContext {
    let mut built = context.build();
    built.input = input.to_vec().into();
    built
}

/// Marks code as published without deploying it; deployment is covered by sandbox tests.
fn publish(factory: &mut Factory) {
    factory.vault_code_hash = Some([7; 32]);
    factory.code_version = 1;
}

#[test]
fn publish_records_the_code_hash() {
    let (mut factory, context) = setup();
    testing_env!(with_input(&context, b"\0asm-vault"));
    let hash = factory.publish_vault_code();
    let config = factory.get_config();
    assert_eq!(config.vault_code_hash, Some(hash));
    assert_eq!(config.code_version, 1);
}

#[test]
fn golden_fixtures_match_the_sdk() {
    let (mut factory, mut context) = setup();
    testing_env!(with_input(&context, b"\0asm-vault"));
    factory.publish_vault_code();
    // `testing_env!` clears the logs, so collect them before switching the caller.
    let mut events = get_logs();
    testing_env!(context.predecessor_account_id(id("factory.near")).build());
    factory.on_vault_created(
        id("alice.factory.near"),
        id("alice.near"),
        id("alice.near"),
        MIN_VAULT_DEPOSIT,
        1,
        Ok(()),
    );
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/sdk/test/fixtures/factory-events.jsonl");
    events.extend(get_logs());
    comatocard_common::golden::assert_matches(&path, &events);
}

#[test]
#[should_panic(expected = "vault code is not published yet")]
fn create_requires_published_code() {
    let (mut factory, mut context) = setup();
    testing_env!(context.attached_deposit(MIN_VAULT_DEPOSIT).build());
    let _ = factory.create_vault("alice".to_owned(), None, None, None, None);
}

#[test]
#[should_panic(expected = "attach at least")]
fn create_requires_minimum_deposit() {
    let (mut factory, mut context) = setup();
    publish(&mut factory);
    testing_env!(
        context
            .attached_deposit(NearToken::from_millinear(1))
            .build()
    );
    let _ = factory.create_vault("alice".to_owned(), None, None, None, None);
}

#[test]
#[should_panic(expected = "single account label")]
fn create_rejects_nested_names() {
    let (mut factory, mut context) = setup();
    publish(&mut factory);
    testing_env!(context.attached_deposit(MIN_VAULT_DEPOSIT).build());
    let _ = factory.create_vault("a.b".to_owned(), None, None, None, None);
}

#[test]
fn successful_creation_is_listed_and_failed_creation_is_not() {
    let (mut factory, mut context) = setup();
    testing_env!(context.predecessor_account_id(id("factory.near")).build());
    let created = factory.on_vault_created(
        id("alice.factory.near"),
        id("alice.near"),
        id("alice.near"),
        MIN_VAULT_DEPOSIT,
        1,
        Ok(()),
    );
    assert_eq!(created, Some(id("alice.factory.near")));
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("\"event\":\"vault_created\""))
    );
    let failed = factory.on_vault_created(
        id("bob.factory.near"),
        id("bob.near"),
        id("bob.near"),
        MIN_VAULT_DEPOSIT,
        1,
        Err(PromiseError::Failed),
    );
    assert_eq!(failed, None);
    assert_eq!(
        factory.list_vaults(id("alice.near")),
        vec![id("alice.factory.near")]
    );
    assert!(factory.list_vaults(id("bob.near")).is_empty());
}

#[test]
#[should_panic(expected = "only the owner may call this method")]
fn only_owner_sets_defaults() {
    let (mut factory, mut context) = setup();
    testing_env!(context.predecessor_account_id(id("eve.near")).build());
    factory.set_defaults(vec![], None);
}
