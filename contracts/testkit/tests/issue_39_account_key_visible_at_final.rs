//! Regression for #39: `Env::account` returned once the genesis key was visible optimistically,
//! while the signer reads the nonce at the final block, so the next transaction could fail.

use near_api::types::Reference;
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PUBLIC_KEY;
use testkit::Env;

#[tokio::test]
async fn issue_39_account_key_is_visible_at_the_final_block() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let public_key: near_api::PublicKey = DEFAULT_GENESIS_ACCOUNT_PUBLIC_KEY.parse()?;
    for index in 0..5 {
        let account_id = env.account(&format!("account{index}")).await?;
        near_api::Account(account_id.clone())
            .access_key(public_key)
            .at(Reference::Final)
            .fetch_from(&env.network)
            .await
            .map_err(|error| anyhow::anyhow!("{account_id} not final: {error}"))?;
    }
    Ok(())
}
