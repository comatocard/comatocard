//! The factory publishes vault code as a global contract and creates working vaults from it.

use near_api::{AccountId, NearGas, NearToken, Signer};
use serde_json::{Value, json};
use testkit::Env;

const UNIT: u128 = 1_000_000;

async fn setup() -> anyhow::Result<(Env, AccountId, AccountId, AccountId)> {
    let env = Env::new().await?;
    let token = env
        .deploy("tusd", testkit::wasm("mock-ft")?, "new", json!({}))
        .await?;
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
    Ok((env, token, factory, admin))
}

#[tokio::test]
async fn creates_a_vault_that_pays_with_a_card() -> anyhow::Result<()> {
    let (env, token, factory, _) = setup().await?;
    let alice = env.account("alice").await?;
    let shop = env.account("shop").await?;

    let created = env
        .call(&alice, &factory, "create_vault", json!({ "name": "alice" }))
        .deposit(NearToken::from_near(2))
        .send()
        .await?
        .assert_success();
    let logs: Vec<String> = created.logs().iter().map(ToString::to_string).collect();
    assert!(
        logs.iter()
            .any(|l| l.contains("\"event\":\"vault_created\""))
    );
    let vault: AccountId = format!("alice.{factory}").parse()?;
    let listed: Vec<AccountId> = env
        .view(&factory, "list_vaults", json!({ "owner": alice }))
        .await?;
    assert_eq!(listed, vec![vault.clone()]);
    let config: Value = env.view(&vault, "get_config", json!({})).await?;
    assert_eq!(config["owner"], alice.as_str());
    assert_eq!(config["factory"], factory.as_str());

    // Vaults created by the factory hold no access keys, so alice pays for every registration.
    for account in [&alice, &shop, &vault] {
        env.call(
            &alice,
            &token,
            "storage_deposit",
            json!({ "account_id": account }),
        )
        .deposit(NearToken::from_millinear(10))
        .send()
        .await?
        .assert_success();
    }
    env.call(
        &alice,
        &token,
        "mint",
        json!({ "account_id": alice, "amount": (20 * UNIT).to_string() }),
    )
    .send()
    .await?
    .assert_success();
    env.call(
        &alice,
        &token,
        "ft_transfer_call",
        json!({ "receiver_id": vault, "amount": (20 * UNIT).to_string(), "msg": "" }),
    )
    .deposit(NearToken::from_yoctonear(1))
    .send()
    .await?
    .assert_success();

    let secret = near_api::signer::generate_secret_key()?;
    let card_key = secret.public_key().to_string();
    let card = Signer::from_secret_key(secret)?;
    env.call(
        &alice,
        &vault,
        "create_card",
        json!({
            "public_key": card_key,
            "label": "groceries",
            "kind": "human",
            "policy": {
                "token": token,
                "per_tx_limit": (10 * UNIT).to_string(),
                "daily_limit": (10 * UNIT).to_string(),
                "monthly_limit": (10 * UNIT).to_string(),
                "approval_threshold": null,
                "merchants": "any",
                "valid_from": null,
                "expires_at": null,
                "risk_mode": "off",
            },
            "gas_allowance": null,
        }),
    )
    .send()
    .await?
    .assert_success();

    env.call(
        &vault,
        &vault,
        "pay",
        json!({ "merchant": shop, "amount": (7 * UNIT).to_string(), "memo": null, "reference": null }),
    )
    .signer(card)
    .gas(NearGas::from_tgas(100))
    .send()
    .await?
    .assert_success();
    let paid: String = env
        .view(&token, "ft_balance_of", json!({ "account_id": shop }))
        .await?;
    assert_eq!(paid, (7 * UNIT).to_string());
    Ok(())
}

#[tokio::test]
async fn failed_creation_refunds_and_lists_nothing() -> anyhow::Result<()> {
    let (env, _, factory, _) = setup().await?;
    let alice = env.account("alice").await?;
    env.call(&alice, &factory, "create_vault", json!({ "name": "alice" }))
        .deposit(NearToken::from_near(2))
        .send()
        .await?
        .assert_success();

    let before = near_api::Tokens::account(alice.clone())
        .near_balance()
        .fetch_from(&env.network)
        .await?
        .total;
    // The account already exists, so the creation batch fails and the callback refunds.
    let _outcome = env
        .call(&alice, &factory, "create_vault", json!({ "name": "alice" }))
        .deposit(NearToken::from_near(2))
        .send()
        .await?;
    let after = near_api::Tokens::account(alice.clone())
        .near_balance()
        .fetch_from(&env.network)
        .await?
        .total;
    assert!(
        before.saturating_sub(after) < NearToken::from_millinear(50),
        "deposit must be refunded, lost {}",
        before.saturating_sub(after)
    );
    let listed: Vec<AccountId> = env
        .view(&factory, "list_vaults", json!({ "owner": alice }))
        .await?;
    assert_eq!(listed.len(), 1);
    Ok(())
}

#[tokio::test]
async fn only_the_owner_publishes_code() -> anyhow::Result<()> {
    let (env, _, factory, _) = setup().await?;
    let eve = env.account("eve").await?;
    env.call_raw(&eve, &factory, "publish_vault_code", vec![0, 97, 115, 109])
        .send()
        .await?
        .assert_failure();
    Ok(())
}
