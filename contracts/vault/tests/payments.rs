//! End-to-end payment flows against near-sandbox: a real tUSD token, a vault, and a card key that
//! signs `pay` on the vault account.

use std::sync::Arc;

use near_api::{AccountId, NearGas, NearToken, Signer};
use serde_json::{Value, json};
use testkit::Env;

const UNIT: u128 = 1_000_000;
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// Gas a card attaches to `pay`, within the default allowance of the card key.
const CARD_GAS: NearGas = NearGas::from_tgas(100);

struct World {
    env: Env,
    token: AccountId,
    vault: AccountId,
    owner: AccountId,
    shop: AccountId,
    card: Arc<Signer>,
    card_key: String,
}

fn policy(token: &AccountId) -> Value {
    json!({
        "token": token,
        "per_tx_limit": (100 * UNIT).to_string(),
        "daily_limit": (150 * UNIT).to_string(),
        "monthly_limit": (1_000 * UNIT).to_string(),
        "approval_threshold": (50 * UNIT).to_string(),
        "merchants": "any",
        "valid_from": null,
        "expires_at": null,
        "risk_mode": "off",
    })
}

async fn register(env: &Env, token: &AccountId, account: &AccountId) -> anyhow::Result<()> {
    env.call(
        account,
        token,
        "storage_deposit",
        json!({ "account_id": account }),
    )
    .deposit(NearToken::from_millinear(10))
    .send()
    .await?
    .assert_success();
    Ok(())
}

async fn balance(env: &Env, token: &AccountId, account: &AccountId) -> anyhow::Result<u128> {
    let value: String = env
        .view(token, "ft_balance_of", json!({ "account_id": account }))
        .await?;
    Ok(value.parse()?)
}

async fn setup() -> anyhow::Result<World> {
    let env = Env::new().await?;
    let token = env
        .deploy("tusd", testkit::wasm("mock-ft")?, "new", json!({}))
        .await?;
    let owner = env.account("owner").await?;
    let shop = env.account("shop").await?;
    let vault = env
        .deploy(
            "vault",
            testkit::wasm("vault")?,
            "new",
            json!({
                "owner": owner,
                "accepted_tokens": [token],
                "registry": null,
                "approval_ttl": null,
            }),
        )
        .await?;
    for account in [&owner, &shop, &vault] {
        register(&env, &token, account).await?;
    }
    env.call(
        &owner,
        &token,
        "mint",
        json!({ "account_id": owner, "amount": (1_000 * UNIT).to_string() }),
    )
    .send()
    .await?
    .assert_success();
    env.call(
        &owner,
        &token,
        "ft_transfer_call",
        json!({ "receiver_id": vault, "amount": (500 * UNIT).to_string(), "msg": "" }),
    )
    .deposit(ONE_YOCTO)
    .send()
    .await?
    .assert_success();

    let secret = near_api::signer::generate_secret_key()?;
    let card_key = secret.public_key().to_string();
    let card = Signer::from_secret_key(secret)?;
    env.call(
        &owner,
        &vault,
        "create_card",
        json!({
            "public_key": card_key,
            "label": "research agent",
            "kind": "agent",
            "policy": policy(&token),
            "gas_allowance": null,
        }),
    )
    .send()
    .await?
    .assert_success();

    Ok(World {
        env,
        token,
        vault,
        owner,
        shop,
        card,
        card_key,
    })
}

impl World {
    async fn pay(
        &self,
        merchant: &AccountId,
        amount: u128,
    ) -> anyhow::Result<(Value, Vec<String>)> {
        let success = self
            .env
            .call(
                &self.vault,
                &self.vault,
                "pay",
                json!({
                    "merchant": merchant,
                    "amount": (amount * UNIT).to_string(),
                    "memo": null,
                    "reference": "inv-1",
                }),
            )
            .signer(self.card.clone())
            .gas(CARD_GAS)
            .send()
            .await?
            .assert_success();
        let logs = success.logs().iter().map(ToString::to_string).collect();
        Ok((success.json()?, logs))
    }

    async fn available(&self) -> anyhow::Result<u128> {
        let balances: Value = self
            .env
            .view(&self.vault, "get_balances", json!({}))
            .await?;
        Ok(balances[0]["available"]
            .as_str()
            .unwrap_or_default()
            .parse()?)
    }
}

fn has_event(logs: &[String], event: &str) -> bool {
    let needle = format!("\"event\":\"{event}\"");
    logs.iter().any(|log| log.contains(&needle))
}

#[tokio::test]
async fn card_key_pays_a_merchant() -> anyhow::Result<()> {
    let world = setup().await?;
    let (decision, logs) = world.pay(&world.shop, 40).await?;
    assert_eq!(decision["status"], "submitted");
    assert!(has_event(&logs, "payment_submitted"));
    assert!(has_event(&logs, "payment_settled"));
    assert_eq!(
        balance(&world.env, &world.token, &world.shop).await?,
        40 * UNIT
    );
    assert_eq!(world.available().await?, 460 * UNIT);
    let card: Value = world
        .env
        .view(&world.vault, "get_card", json!({ "card_id": 0 }))
        .await?;
    assert_eq!(card["spend"]["day_spent"], (40 * UNIT).to_string());
    Ok(())
}

#[tokio::test]
async fn violations_are_recorded_and_move_nothing() -> anyhow::Result<()> {
    let world = setup().await?;
    let (decision, logs) = world.pay(&world.shop, 101).await?;
    assert_eq!(decision["status"], "rejected");
    assert_eq!(decision["reason"], "per_tx_limit");
    assert!(
        logs.iter()
            .any(|log| log.contains("\"reason\":\"per_tx_limit\""))
    );
    assert_eq!(balance(&world.env, &world.token, &world.shop).await?, 0);
    assert_eq!(world.available().await?, 500 * UNIT);
    Ok(())
}

#[tokio::test]
async fn card_key_cannot_call_owner_methods() -> anyhow::Result<()> {
    let world = setup().await?;
    let attempt = world
        .env
        .call(
            &world.vault,
            &world.vault,
            "withdraw",
            json!({ "token": world.token, "amount": UNIT.to_string(), "receiver_id": world.shop }),
        )
        .signer(world.card.clone())
        .gas(CARD_GAS)
        .send()
        .await;
    match attempt {
        Err(_) => {}
        Ok(result) => {
            result.assert_failure();
        }
    }
    assert_eq!(world.available().await?, 500 * UNIT);
    Ok(())
}

#[tokio::test]
async fn queued_payment_settles_after_owner_approval() -> anyhow::Result<()> {
    let world = setup().await?;
    let (decision, logs) = world.pay(&world.shop, 60).await?;
    assert_eq!(decision["status"], "queued");
    assert_eq!(decision["cause"], "threshold");
    assert!(has_event(&logs, "payment_queued"));
    assert_eq!(balance(&world.env, &world.token, &world.shop).await?, 0);

    let payment_id = decision["payment_id"].as_u64().unwrap_or_default();
    let success = world
        .env
        .call(
            &world.owner,
            &world.vault,
            "approve_payment",
            json!({ "payment_id": payment_id }),
        )
        .send()
        .await?
        .assert_success();
    let logs: Vec<String> = success.logs().iter().map(ToString::to_string).collect();
    assert!(has_event(&logs, "payment_approved"));
    assert!(has_event(&logs, "payment_settled"));
    assert_eq!(
        balance(&world.env, &world.token, &world.shop).await?,
        60 * UNIT
    );
    Ok(())
}

#[tokio::test]
async fn unregistered_merchant_rolls_back() -> anyhow::Result<()> {
    let world = setup().await?;
    let stranger = world.env.account("stranger").await?;
    let (decision, logs) = world.pay(&stranger, 30).await?;
    assert_eq!(decision["status"], "submitted");
    assert!(
        logs.iter()
            .any(|log| log.contains("\"cause\":\"transfer_failed\""))
    );
    assert_eq!(world.available().await?, 500 * UNIT);
    let card: Value = world
        .env
        .view(&world.vault, "get_card", json!({ "card_id": 0 }))
        .await?;
    assert_eq!(card["spend"]["day_spent"], "0");
    Ok(())
}

#[tokio::test]
async fn revoked_card_key_is_deleted() -> anyhow::Result<()> {
    let world = setup().await?;
    world
        .env
        .call(
            &world.owner,
            &world.vault,
            "revoke_card",
            json!({ "card_id": 0 }),
        )
        .send()
        .await?
        .assert_success();
    let attempt = world.pay(&world.shop, 10).await;
    assert!(attempt.is_err(), "a deleted key must not sign transactions");
    let card: Value = world
        .env
        .view(
            &world.vault,
            "get_card_by_key",
            json!({ "public_key": world.card_key }),
        )
        .await?;
    assert!(card.is_null());
    Ok(())
}
