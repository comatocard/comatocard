//! Comatocard setup steps shared by the contract integration tests.

use std::sync::Arc;

use anyhow::Result;
use near_api::types::transaction::result::ExecutionSuccess;
use near_api::{AccountId, NearGas, NearToken, Signer};
use serde_json::{Value, json};

use crate::Env;

/// One tUSD in its smallest unit.
pub const UNIT: u128 = 1_000_000;

/// Gas a card attaches to `pay`, within the default card key allowance.
pub const CARD_GAS: NearGas = NearGas::from_tgas(100);

/// Deploys the tUSD test token as `tusd.sandbox`.
///
/// # Errors
/// Fails when the wasm is missing or the deployment fails.
pub async fn deploy_token(env: &Env) -> Result<AccountId> {
    env.deploy("tusd", crate::wasm("mock-ft")?, "new", json!({}))
        .await
}

/// Deploys a vault as `vault.sandbox` for `owner`.
///
/// # Errors
/// Fails when the wasm is missing or the deployment fails.
pub async fn deploy_vault(
    env: &Env,
    owner: &AccountId,
    token: &AccountId,
    registry: Option<&AccountId>,
) -> Result<AccountId> {
    env.deploy(
        "vault",
        crate::wasm("vault")?,
        "new",
        json!({
            "owner": owner,
            "accepted_tokens": [token],
            "registry": registry,
            "approval_ttl": null,
        }),
    )
    .await
}

/// Registers `accounts` with the token (paid by `payer`, so keyless vaults work too), mints
/// `amount` whole tUSD to `payer` and deposits all of it into `vault`.
///
/// # Errors
/// Fails when any of the calls fails.
pub async fn fund_vault(
    env: &Env,
    token: &AccountId,
    payer: &AccountId,
    vault: &AccountId,
    others: &[&AccountId],
    amount: u128,
) -> Result<()> {
    for account in [payer, vault].into_iter().chain(others.iter().copied()) {
        env.call(
            payer,
            token,
            "storage_deposit",
            json!({ "account_id": account }),
        )
        .deposit(NearToken::from_millinear(10))
        .send()
        .await?
        .assert_success();
    }
    let raw = (amount * UNIT).to_string();
    env.call(
        payer,
        token,
        "mint",
        json!({ "account_id": payer, "amount": raw }),
    )
    .send()
    .await?
    .assert_success();
    env.call(
        payer,
        token,
        "ft_transfer_call",
        json!({ "receiver_id": vault, "amount": raw, "msg": "" }),
    )
    .deposit(NearToken::from_yoctonear(1))
    .send()
    .await?
    .assert_success();
    Ok(())
}

/// A card policy in whole tUSD. `overrides` replaces individual fields, for example
/// `json!({ "risk_mode": "strict" })`.
pub fn policy(
    token: &AccountId,
    per_tx: u128,
    daily: u128,
    monthly: u128,
    overrides: &Value,
) -> Value {
    let mut policy = json!({
        "token": token,
        "per_tx_limit": (per_tx * UNIT).to_string(),
        "daily_limit": (daily * UNIT).to_string(),
        "monthly_limit": (monthly * UNIT).to_string(),
        "approval_threshold": null,
        "merchants": "any",
        "valid_from": null,
        "expires_at": null,
        "risk_mode": "off",
    });
    if let (Some(target), Some(changes)) = (policy.as_object_mut(), overrides.as_object()) {
        for (key, value) in changes {
            target.insert(key.clone(), value.clone());
        }
    }
    policy
}

/// Whole tUSD as the JSON string the contracts expect.
pub fn tusd(amount: u128) -> String {
    (amount * UNIT).to_string()
}

/// A freshly generated card key.
pub struct CardKey {
    pub signer: Arc<Signer>,
    pub public_key: String,
}

/// Issues a card on `vault` as `owner` and returns its key.
///
/// # Errors
/// Fails when key generation or `create_card` fails.
pub async fn issue_card(
    env: &Env,
    owner: &AccountId,
    vault: &AccountId,
    label: &str,
    policy: Value,
) -> Result<CardKey> {
    let secret = near_api::signer::generate_secret_key()?;
    let public_key = secret.public_key().to_string();
    let signer = Signer::from_secret_key(secret)?;
    env.call(
        owner,
        vault,
        "create_card",
        json!({
            "public_key": public_key,
            "label": label,
            "kind": "agent",
            "policy": policy,
            "gas_allowance": null,
        }),
    )
    .send()
    .await?
    .assert_success();
    Ok(CardKey { signer, public_key })
}

/// Signs `pay` with the card key and returns the successful outcome.
///
/// # Errors
/// Fails when the card key cannot sign, for example after it was revoked.
pub async fn pay(
    env: &Env,
    vault: &AccountId,
    card: &CardKey,
    merchant: &AccountId,
    amount: u128,
    reference: Option<&str>,
) -> Result<ExecutionSuccess> {
    Ok(env
        .call(
            vault,
            vault,
            "pay",
            json!({
                "merchant": merchant,
                "amount": tusd(amount),
                "memo": null,
                "reference": reference,
            }),
        )
        .signer(card.signer.clone())
        .gas(CARD_GAS)
        .send()
        .await?
        .assert_success())
}

/// The logs of an outcome as owned strings.
pub fn logs(outcome: &ExecutionSuccess) -> Vec<String> {
    outcome.logs().iter().map(ToString::to_string).collect()
}

/// Whether `logs` contain the Comatocard event `name`.
pub fn has_event(logs: &[String], name: &str) -> bool {
    let needle = format!("\"event\":\"{name}\"");
    logs.iter().any(|log| log.contains(&needle))
}

/// The tUSD balance of `account`, in the smallest unit.
///
/// # Errors
/// Fails when the view fails or returns a non-numeric value.
pub async fn balance(env: &Env, token: &AccountId, account: &AccountId) -> Result<u128> {
    let value: String = env
        .view(token, "ft_balance_of", json!({ "account_id": account }))
        .await?;
    Ok(value.parse()?)
}
