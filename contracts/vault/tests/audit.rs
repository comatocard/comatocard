//! Regressions for the contract audit, reproduced end to end in near-sandbox before the fixes.

use near_api::{NearGas, NearToken};
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{deploy_token, deploy_vault, fund_vault, issue_card, pay, policy, tusd};

/// The genesis key controls every sandbox account, so it is a full-access key of the vault.
const FULL_ACCESS_KEY: &str = "ed25519:5BGSaf6YjVm7565VzWQHNxoyEjwr3jUpRJSGjREvU9dB";

async fn reserved(env: &Env, vault: &near_api::AccountId) -> anyhow::Result<String> {
    let balances: Value = env.view(vault, "get_balances", json!({})).await?;
    Ok(balances[0]["reserved"]
        .as_str()
        .unwrap_or_default()
        .to_owned())
}

#[tokio::test]
async fn issue_58_low_gas_cannot_strand_a_reservation() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let shop = env.account("shop").await?;
    let registry = env
        .deploy(
            "registry",
            testkit::wasm("registry")?,
            "new",
            json!({ "owner": owner }),
        )
        .await?;
    let vault = deploy_vault(&env, &owner, &token, Some(&registry)).await?;
    fund_vault(&env, &token, &owner, &vault, &[&shop], 100).await?;
    let card = issue_card(
        &env,
        &owner,
        &vault,
        "agent",
        policy(&token, 50, 100, 100, &json!({ "risk_mode": "block_only" })),
    )
    .await?;
    for tgas in [36, 50] {
        let attempt = env
            .call(
                &vault,
                &vault,
                "pay",
                json!({ "merchant": shop, "amount": tusd(1), "memo": null, "reference": null }),
            )
            .signer(card.signer.clone())
            .gas(NearGas::from_tgas(tgas))
            .send()
            .await?;
        assert!(
            attempt.into_result().is_err(),
            "{tgas} Tgas is refused up front"
        );
        assert_eq!(reserved(&env, &vault).await?, "0");
    }
    pay(&env, &vault, &card, &shop, 1, None).await?;
    assert_eq!(
        reserved(&env, &vault).await?,
        "0",
        "a funded payment settles"
    );
    Ok(())
}

#[tokio::test]
async fn issue_59_a_holder_cannot_delete_the_vault_full_access_key() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let agent = env.account("agent").await?;
    let other = env.account("other").await?;
    let vault = deploy_vault(&env, &owner, &token, None).await?;
    issue_card(
        &env,
        &owner,
        &vault,
        "card",
        policy(&token, 5, 5, 5, &json!({})),
    )
    .await?;
    let transfer = |from: &near_api::AccountId, to: &near_api::AccountId| {
        env.call(
            from,
            &vault,
            "nft_transfer",
            json!({ "receiver_id": to, "token_id": "0", "approval_id": null, "memo": null }),
        )
        .deposit(NearToken::from_yoctonear(1))
    };
    transfer(&owner, &agent).send().await?.assert_success();
    env.call(
        &agent,
        &vault,
        "set_card_key",
        json!({ "card_id": 0, "public_key": FULL_ACCESS_KEY }),
    )
    .deposit(NearToken::from_near(1))
    .send()
    .await?
    .assert_success();
    let card: Value = env
        .view(&vault, "get_card", json!({ "card_id": 0 }))
        .await?;
    assert_eq!(
        card["public_key"],
        Value::Null,
        "the existing key is not mapped"
    );
    transfer(&agent, &other).send().await?.assert_success();
    let key: near_api::PublicKey = FULL_ACCESS_KEY.parse()?;
    near_api::Account(vault.clone())
        .access_key(key)
        .fetch_from(&env.network)
        .await
        .map_err(|error| anyhow::anyhow!("the full-access key was deleted: {error}"))?;
    Ok(())
}

#[tokio::test]
async fn issue_60_a_refused_token_returns_despite_many_stored_payments() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let agent = env.account("agent").await?;
    let shop = env.account("shop").await?;
    let vault = deploy_vault(&env, &owner, &token, None).await?;
    fund_vault(&env, &token, &owner, &vault, &[&shop], 1_000).await?;
    let spam = issue_card(
        &env,
        &owner,
        &vault,
        "spam",
        policy(
            &token,
            10,
            1_000,
            1_000,
            &json!({ "approval_threshold": "0" }),
        ),
    )
    .await?;
    issue_card(
        &env,
        &owner,
        &vault,
        "handed",
        policy(&token, 5, 5, 5, &json!({})),
    )
    .await?;
    for _ in 0..10 {
        pay(&env, &vault, &spam, &shop, 1, None).await?;
    }
    let decision: Value = pay(&env, &vault, &spam, &shop, 1, None).await?.json()?;
    assert_eq!(
        decision["reason"], "queue_full",
        "the eleventh payment is refused"
    );
    let returned: bool = env
        .call(
            &owner,
            &vault,
            "nft_transfer_call",
            json!({ "receiver_id": agent, "token_id": "1", "approval_id": null, "memo": null, "msg": "" }),
        )
        .deposit(NearToken::from_yoctonear(1))
        .send()
        .await?
        .assert_success()
        .json()?;
    assert!(
        !returned,
        "the receiver has no contract, so the transfer is reverted"
    );
    let holder: Value = env
        .view(&vault, "nft_token", json!({ "token_id": "1" }))
        .await?;
    assert_eq!(holder["owner_id"], owner.to_string());
    Ok(())
}
