//! Integration tests for the tUSD faucet token against near-sandbox.

use near_api::{AccountId, NearGas, NearToken};
use serde_json::json;
use testkit::Env;

const ONE_TUSD: u128 = 1_000_000;

async fn setup() -> anyhow::Result<(Env, AccountId)> {
    let env = Env::new().await?;
    let token = env
        .deploy("tusd", testkit::wasm("mock-ft")?, "new", json!({}))
        .await?;
    Ok((env, token))
}

async fn register(env: &Env, token: &AccountId, account: &AccountId) -> anyhow::Result<()> {
    near_api::Contract(token.clone())
        .call_function("storage_deposit", json!({ "account_id": account }))
        .transaction()
        .deposit(NearToken::from_millinear(10))
        .with_signer(account.clone(), env.signer.clone())
        .send_to(&env.network)
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

#[tokio::test]
async fn faucet_mints_and_tokens_transfer() -> anyhow::Result<()> {
    let (env, token) = setup().await?;
    let alice = env.account("alice").await?;
    let bob = env.account("bob").await?;
    register(&env, &token, &alice).await?;
    register(&env, &token, &bob).await?;

    near_api::Contract(token.clone())
        .call_function(
            "mint",
            json!({ "account_id": alice, "amount": (100 * ONE_TUSD).to_string() }),
        )
        .transaction()
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    assert_eq!(balance(&env, &token, &alice).await?, 100 * ONE_TUSD);

    near_api::Contract(token.clone())
        .call_function(
            "ft_transfer",
            json!({ "receiver_id": bob, "amount": (40 * ONE_TUSD).to_string() }),
        )
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();
    assert_eq!(balance(&env, &token, &alice).await?, 60 * ONE_TUSD);
    assert_eq!(balance(&env, &token, &bob).await?, 40 * ONE_TUSD);
    Ok(())
}

#[tokio::test]
async fn faucet_rejects_unregistered_and_over_cap() -> anyhow::Result<()> {
    let (env, token) = setup().await?;
    let alice = env.account("alice").await?;

    near_api::Contract(token.clone())
        .call_function(
            "mint",
            json!({ "account_id": alice, "amount": ONE_TUSD.to_string() }),
        )
        .transaction()
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_failure();

    register(&env, &token, &alice).await?;
    let cap: String = env.view(&token, "mint_cap", json!({})).await?;
    let over_cap = cap.parse::<u128>()? + 1;
    near_api::Contract(token.clone())
        .call_function(
            "mint",
            json!({ "account_id": alice, "amount": over_cap.to_string() }),
        )
        .transaction()
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_failure();
    assert_eq!(balance(&env, &token, &alice).await?, 0);
    Ok(())
}

#[tokio::test]
async fn transfer_call_to_account_without_contract_is_refunded() -> anyhow::Result<()> {
    let (env, token) = setup().await?;
    let alice = env.account("alice").await?;
    let plain = env.account("plain").await?;
    register(&env, &token, &alice).await?;
    register(&env, &token, &plain).await?;
    near_api::Contract(token.clone())
        .call_function(
            "mint",
            json!({ "account_id": alice, "amount": (10 * ONE_TUSD).to_string() }),
        )
        .transaction()
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?
        .assert_success();

    // The receiver call fails because `plain` has no contract; the outcome of the outer
    // transaction is irrelevant, the balances below prove the refund.
    let _outcome = near_api::Contract(token.clone())
        .call_function(
            "ft_transfer_call",
            json!({ "receiver_id": plain, "amount": (3 * ONE_TUSD).to_string(), "msg": "" }),
        )
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .gas(NearGas::from_tgas(100))
        .with_signer(alice.clone(), env.signer.clone())
        .send_to(&env.network)
        .await?;

    assert_eq!(balance(&env, &token, &alice).await?, 10 * ONE_TUSD);
    assert_eq!(balance(&env, &token, &plain).await?, 0);
    Ok(())
}
