//! End-to-end payment flows against near-sandbox: a real tUSD token, a vault, and a card key that
//! signs `pay` on the vault account.

use near_api::AccountId;
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{
    CARD_GAS, CardKey, UNIT, balance, deploy_token, deploy_vault, fund_vault, has_event,
    issue_card, logs, pay, policy, tusd,
};

struct World {
    env: Env,
    token: AccountId,
    vault: AccountId,
    owner: AccountId,
    shop: AccountId,
    card: CardKey,
}

async fn setup() -> anyhow::Result<World> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let shop = env.account("shop").await?;
    let vault = deploy_vault(&env, &owner, &token, None).await?;
    fund_vault(&env, &token, &owner, &vault, &[&shop], 500).await?;
    let card_policy = policy(
        &token,
        100,
        150,
        1_000,
        &json!({ "approval_threshold": tusd(50) }),
    );
    let card = issue_card(&env, &owner, &vault, "research agent", card_policy).await?;
    Ok(World {
        env,
        token,
        vault,
        owner,
        shop,
        card,
    })
}

impl World {
    async fn pay(
        &self,
        merchant: &AccountId,
        amount: u128,
    ) -> anyhow::Result<(Value, Vec<String>)> {
        let outcome = pay(
            &self.env,
            &self.vault,
            &self.card,
            merchant,
            amount,
            Some("inv-1"),
        )
        .await?;
        let lines = logs(&outcome);
        Ok((outcome.json()?, lines))
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

    async fn day_spent(&self) -> anyhow::Result<Value> {
        let card: Value = self
            .env
            .view(&self.vault, "get_card", json!({ "card_id": 0 }))
            .await?;
        Ok(card["spend"]["day_spent"].clone())
    }
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
    assert_eq!(world.day_spent().await?, tusd(40));
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
        .signer(world.card.signer.clone())
        .gas(CARD_GAS)
        .send()
        .await;
    if let Ok(result) = attempt {
        result.assert_failure();
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
    let approved = world
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
    let logs = testkit::comatocard::logs(&approved);
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
    assert_eq!(world.day_spent().await?, "0");
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
            json!({ "public_key": world.card.public_key }),
        )
        .await?;
    assert!(card.is_null());
    Ok(())
}
