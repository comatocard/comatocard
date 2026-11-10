//! The registry and a vault together: risk modes decide what happens to payments to reported
//! merchants.

use near_api::{AccountId, NearToken};
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{
    CardKey, UNIT, balance, deploy_token, deploy_vault, fund_vault, has_event, issue_card, logs,
    pay, policy,
};

struct World {
    env: Env,
    token: AccountId,
    registry: AccountId,
    vault: AccountId,
    owner: AccountId,
    curator: AccountId,
    shop: AccountId,
    card: CardKey,
}

async fn setup(risk_mode: &str) -> anyhow::Result<World> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let curator = env.account("curator").await?;
    let reporter = env.account("reporter").await?;
    let shop = env.account("shop").await?;
    let registry = env
        .deploy(
            "registry",
            testkit::wasm("registry")?,
            "new",
            json!({ "owner": owner }),
        )
        .await?;
    env.call(
        &owner,
        &registry,
        "add_curator",
        json!({ "account_id": curator }),
    )
    .send()
    .await?
    .assert_success();
    let vault = deploy_vault(&env, &owner, &token, Some(&registry)).await?;
    fund_vault(&env, &token, &owner, &vault, &[&shop], 100).await?;
    let card_policy = policy(&token, 50, 100, 100, &json!({ "risk_mode": risk_mode }));
    let card = issue_card(&env, &owner, &vault, "agent", card_policy).await?;
    env.call(
        &reporter,
        &registry,
        "report",
        json!({ "account_id": shop, "category": "scam", "evidence_uri": "ipfs://evidence" }),
    )
    .deposit(NearToken::from_millinear(10))
    .send()
    .await?
    .assert_success();
    Ok(World {
        env,
        token,
        registry,
        vault,
        owner,
        curator,
        shop,
        card,
    })
}

impl World {
    async fn set_status(&self, status: &str) -> anyhow::Result<()> {
        self.env
            .call(
                &self.curator,
                &self.registry,
                "set_status",
                json!({ "account_id": self.shop, "status": status, "report_ids": [0] }),
            )
            .send()
            .await?
            .assert_success();
        Ok(())
    }

    async fn pay(&self, amount: u128) -> anyhow::Result<(Value, Vec<String>)> {
        let outcome = pay(&self.env, &self.vault, &self.card, &self.shop, amount, None).await?;
        let lines = logs(&outcome);
        Ok((outcome.json()?, lines))
    }

    async fn shop_balance(&self) -> anyhow::Result<u128> {
        balance(&self.env, &self.token, &self.shop).await
    }
}

#[tokio::test]
async fn blocked_merchant_is_not_paid() -> anyhow::Result<()> {
    let world = setup("block_only").await?;
    world.set_status("blocked").await?;
    let (decision, logs) = world.pay(10).await?;
    assert_eq!(decision["status"], "submitted");
    assert!(
        logs.iter()
            .any(|l| l.contains("\"cause\":\"merchant_blocked\""))
    );
    assert_eq!(world.shop_balance().await?, 0);
    Ok(())
}

#[tokio::test]
async fn clear_merchant_is_paid_through_the_registry() -> anyhow::Result<()> {
    let world = setup("block_only").await?;
    let (_, logs) = world.pay(10).await?;
    assert!(has_event(&logs, "payment_settled"));
    assert_eq!(world.shop_balance().await?, 10 * UNIT);
    Ok(())
}

#[tokio::test]
async fn flagged_merchant_waits_for_approval_in_strict_mode() -> anyhow::Result<()> {
    let world = setup("strict").await?;
    world.set_status("flagged").await?;
    let (decision, logs) = world.pay(10).await?;
    assert_eq!(decision["status"], "submitted");
    assert!(
        logs.iter()
            .any(|l| l.contains("\"cause\":\"risk_flagged\""))
    );
    assert_eq!(world.shop_balance().await?, 0);

    world
        .env
        .call(
            &world.owner,
            &world.vault,
            "approve_payment",
            json!({ "payment_id": 0 }),
        )
        .send()
        .await?
        .assert_success();
    assert_eq!(world.shop_balance().await?, 10 * UNIT);
    Ok(())
}
