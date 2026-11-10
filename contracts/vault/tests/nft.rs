//! Card tokens against near-sandbox: the owner hands a card to an agent account by transferring
//! the NEP-171 token, the previous key stops working and the agent pays with a key it set itself.

use near_api::{NearToken, Signer};
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{
    CardKey, balance, deploy_token, deploy_vault, fund_vault, has_event, issue_card, logs, pay,
    policy,
};

#[tokio::test]
async fn transferred_card_pays_only_with_the_new_holder_key() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let agent = env.account("agent").await?;
    let shop = env.account("shop").await?;
    let vault = deploy_vault(&env, &owner, &token, None).await?;
    fund_vault(&env, &token, &owner, &vault, &[&shop], 100).await?;
    let old_card = issue_card(
        &env,
        &owner,
        &vault,
        "handover",
        policy(&token, 20, 50, 100, &json!({})),
    )
    .await?;

    let transfer = env
        .call(
            &owner,
            &vault,
            "nft_transfer",
            json!({ "receiver_id": agent, "token_id": "0", "approval_id": null, "memo": null }),
        )
        .deposit(NearToken::from_yoctonear(1))
        .send()
        .await?
        .assert_success();
    assert!(has_event(&logs(&transfer), "card_transferred"));
    let token_view: Value = env
        .view(&vault, "nft_token", json!({ "token_id": "0" }))
        .await?;
    assert_eq!(token_view["owner_id"], agent.to_string());

    let attempt = pay(&env, &vault, &old_card, &shop, 5, None).await;
    assert!(attempt.is_err(), "the previous key must be deleted");

    let secret = near_api::signer::generate_secret_key()?;
    let new_card = CardKey {
        public_key: secret.public_key().to_string(),
        signer: Signer::from_secret_key(secret)?,
    };
    env.call(
        &agent,
        &vault,
        "set_card_key",
        json!({ "card_id": 0, "public_key": new_card.public_key }),
    )
    .deposit(NearToken::from_near(1))
    .send()
    .await?
    .assert_success();

    pay(&env, &vault, &new_card, &shop, 5, None).await?;
    assert_eq!(balance(&env, &token, &shop).await?, 5_000_000);
    Ok(())
}
