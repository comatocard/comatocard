//! The registry and a vault together: risk modes decide what happens to payments to reported
//! merchants.

use std::sync::Arc;

use near_api::{AccountId, NearGas, NearToken, Signer};
use serde_json::{Value, json};
use testkit::Env;

const UNIT: u128 = 1_000_000;
const CARD_GAS: NearGas = NearGas::from_tgas(100);

struct World {
    env: Env,
    token: AccountId,
    registry: AccountId,
    vault: AccountId,
    owner: AccountId,
    curator: AccountId,
    shop: AccountId,
    card: Arc<Signer>,
}

/// Registers the accounts with the token and deposits 100 tUSD from `owner` into the vault.
async fn fund_vault(
    env: &Env,
    token: &AccountId,
    owner: &AccountId,
    others: &[&AccountId],
    vault: &AccountId,
) -> anyhow::Result<()> {
    for account in [owner, vault].into_iter().chain(others.iter().copied()) {
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
    }
    env.call(
        owner,
        token,
        "mint",
        json!({ "account_id": owner, "amount": (100 * UNIT).to_string() }),
    )
    .send()
    .await?
    .assert_success();
    env.call(
        owner,
        token,
        "ft_transfer_call",
        json!({ "receiver_id": vault, "amount": (100 * UNIT).to_string(), "msg": "" }),
    )
    .deposit(NearToken::from_yoctonear(1))
    .send()
    .await?
    .assert_success();

    Ok(())
}

/// Issues a card with the given risk mode and returns its signer.
async fn issue_card(
    env: &Env,
    owner: &AccountId,
    vault: &AccountId,
    token: &AccountId,
    risk_mode: &str,
) -> anyhow::Result<Arc<Signer>> {
    let secret = near_api::signer::generate_secret_key()?;
    let public_key = secret.public_key().to_string();
    let card = Signer::from_secret_key(secret)?;
    env.call(
        owner,
        vault,
        "create_card",
        json!({
            "public_key": public_key,
            "label": "agent",
            "kind": "agent",
            "policy": {
                "token": token,
                "per_tx_limit": (50 * UNIT).to_string(),
                "daily_limit": (100 * UNIT).to_string(),
                "monthly_limit": (100 * UNIT).to_string(),
                "approval_threshold": null,
                "merchants": "any",
                "valid_from": null,
                "expires_at": null,
                "risk_mode": risk_mode,
            },
            "gas_allowance": null,
        }),
    )
    .send()
    .await?
    .assert_success();

    Ok(card)
}

async fn setup(risk_mode: &str) -> anyhow::Result<World> {
    let env = Env::new().await?;
    let token = env
        .deploy("tusd", testkit::wasm("mock-ft")?, "new", json!({}))
        .await?;
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
    let vault = env
        .deploy(
            "vault",
            testkit::wasm("vault")?,
            "new",
            json!({
                "owner": owner,
                "accepted_tokens": [token],
                "registry": registry,
                "approval_ttl": null,
            }),
        )
        .await?;
    fund_vault(&env, &token, &owner, &[&shop], &vault).await?;
    let card = issue_card(&env, &owner, &vault, &token, risk_mode).await?;

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
        let success = self
            .env
            .call(
                &self.vault,
                &self.vault,
                "pay",
                json!({
                    "merchant": self.shop,
                    "amount": (amount * UNIT).to_string(),
                    "memo": null,
                    "reference": null,
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

    async fn shop_balance(&self) -> anyhow::Result<u128> {
        let value: String = self
            .env
            .view(
                &self.token,
                "ft_balance_of",
                json!({ "account_id": self.shop }),
            )
            .await?;
        Ok(value.parse()?)
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
    assert!(
        logs.iter()
            .any(|l| l.contains("\"event\":\"payment_settled\""))
    );
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
