//! The factory publishes vault code as a global contract and creates working vaults from it.

use near_api::{AccountId, NearToken};
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{UNIT, balance, deploy_token, fund_vault, issue_card, pay, policy};

async fn setup() -> anyhow::Result<(Env, AccountId, AccountId)> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let admin = env.account("admin").await?;
    let factory = env
        .deploy(
            "factory",
            testkit::wasm("factory")?,
            "new",
            json!({ "owner": admin, "default_tokens": [token], "default_registry": null }),
        )
        .await?;
    env.call_raw(
        &admin,
        &factory,
        "publish_vault_code",
        testkit::wasm("vault")?,
    )
    .send()
    .await?
    .assert_success();
    Ok((env, token, factory))
}

async fn create_vault(env: &Env, factory: &AccountId, owner: &AccountId) -> anyhow::Result<()> {
    env.call(owner, factory, "create_vault", json!({ "name": "alice" }))
        .deposit(NearToken::from_near(2))
        .send()
        .await?
        .assert_success();
    Ok(())
}

#[tokio::test]
async fn creates_a_vault_that_pays_with_a_card() -> anyhow::Result<()> {
    let (env, token, factory) = setup().await?;
    let alice = env.account("alice").await?;
    let shop = env.account("shop").await?;
    create_vault(&env, &factory, &alice).await?;

    let vault: AccountId = format!("alice.{factory}").parse()?;
    let listed: Vec<AccountId> = env
        .view(&factory, "list_vaults", json!({ "owner": alice }))
        .await?;
    assert_eq!(listed, vec![vault.clone()]);
    let config: Value = env.view(&vault, "get_config", json!({})).await?;
    assert_eq!(config["owner"], alice.as_str());
    assert_eq!(config["factory"], factory.as_str());

    // The vault holds no access keys of its own; alice pays for its token registration.
    fund_vault(&env, &token, &alice, &vault, &[&shop], 20).await?;
    let card = issue_card(
        &env,
        &alice,
        &vault,
        "groceries",
        policy(&token, 10, 10, 10, &json!({})),
    )
    .await?;
    pay(&env, &vault, &card, &shop, 7, None).await?;
    assert_eq!(balance(&env, &token, &shop).await?, 7 * UNIT);
    Ok(())
}

#[tokio::test]
async fn failed_creation_refunds_and_lists_nothing() -> anyhow::Result<()> {
    let (env, _, factory) = setup().await?;
    let alice = env.account("alice").await?;
    create_vault(&env, &factory, &alice).await?;

    let near_balance = || async {
        anyhow::Ok(
            near_api::Tokens::account(alice.clone())
                .near_balance()
                .fetch_from(&env.network)
                .await?
                .total,
        )
    };
    let before = near_balance().await?;
    // The account already exists, so the creation batch fails and the callback refunds.
    let _outcome = env
        .call(&alice, &factory, "create_vault", json!({ "name": "alice" }))
        .deposit(NearToken::from_near(2))
        .send()
        .await?;
    let lost = before.saturating_sub(near_balance().await?);
    assert!(
        lost < NearToken::from_millinear(50),
        "deposit must be refunded, lost {lost}"
    );
    let listed: Vec<AccountId> = env
        .view(&factory, "list_vaults", json!({ "owner": alice }))
        .await?;
    assert_eq!(listed.len(), 1);
    Ok(())
}

#[tokio::test]
async fn only_the_owner_publishes_code() -> anyhow::Result<()> {
    let (env, _, factory) = setup().await?;
    let eve = env.account("eve").await?;
    env.call_raw(&eve, &factory, "publish_vault_code", vec![0, 97, 115, 109])
        .send()
        .await?
        .assert_failure();
    Ok(())
}
