//! A Sputnik DAO owns a vault: ownership moves to the DAO through a proposal, and the DAO decides
//! payments above the card threshold through proposals. The vault needs no DAO-specific code.

use near_api::{AccountId, NearGas, NearToken};
use serde_json::{Value, json};
use testkit::Env;
use testkit::comatocard::{
    CardKey, UNIT, balance, deploy_token, deploy_vault, fund_vault, has_event, issue_card, pay,
    policy, tusd,
};
/// Default Sputnik proposal bond: 1 NEAR, which must be attached exactly.
const PROPOSAL_BOND: NearToken = NearToken::from_near(1);

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(char::from(TABLE[(n >> (18 - 6 * i)) as usize & 63]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// A `FunctionCall` proposal kind that calls `method` on `receiver` with `args`.
fn function_call(receiver: &AccountId, method: &str, args: &Value) -> Value {
    json!({
        "FunctionCall": {
            "receiver_id": receiver,
            "actions": [{
                "method_name": method,
                "args": base64(args.to_string().as_bytes()),
                "deposit": "0",
                "gas": NearGas::from_tgas(150).as_gas().to_string(),
            }],
        }
    })
}

/// Submits a proposal as `council` and approves it with the single council vote, which executes
/// it. Returns the logs of the execution.
async fn propose_and_approve(
    env: &Env,
    dao: &AccountId,
    council: &AccountId,
    kind: Value,
) -> anyhow::Result<Vec<String>> {
    let id: u64 = env
        .call(
            council,
            dao,
            "add_proposal",
            json!({ "proposal": { "description": "comatocard test", "kind": kind } }),
        )
        .deposit(PROPOSAL_BOND)
        .send()
        .await?
        .assert_success()
        .json()?;
    let executed = env
        .call(
            council,
            dao,
            "act_proposal",
            json!({ "id": id, "action": "VoteApprove", "proposal": kind }),
        )
        .send()
        .await?
        .assert_success();
    Ok(testkit::comatocard::logs(&executed))
}

async fn deploy_dao(env: &Env, council: &AccountId) -> anyhow::Result<AccountId> {
    env.deploy(
        "dao",
        testkit::fixture("sputnikdao2.wasm")?,
        "new",
        json!({
            "config": {
                "name": "comatocard-council",
                "purpose": "approve card payments",
                "metadata": "",
            },
            "policy": [council],
        }),
    )
    .await
}

#[tokio::test]
async fn dao_takes_ownership_and_approves_large_payments() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let alice = env.account("alice").await?;
    let council = env.account("council").await?;
    let shop = env.account("shop").await?;
    let dao = deploy_dao(&env, &council).await?;
    let vault = deploy_vault(&env, &alice, &token, None).await?;
    fund_vault(&env, &token, &alice, &vault, &[&shop], 100).await?;
    let card_policy = policy(
        &token,
        80,
        100,
        100,
        &json!({ "approval_threshold": tusd(20) }),
    );
    let card = issue_card(&env, &alice, &vault, "team card", card_policy).await?;

    // Ownership moves to the DAO: alice proposes, the DAO accepts through a proposal.
    env.call(&alice, &vault, "propose_owner", json!({ "new_owner": dao }))
        .send()
        .await?
        .assert_success();
    let accept = function_call(&vault, "accept_owner", &json!({}));
    let logs = propose_and_approve(&env, &dao, &council, accept).await?;
    assert!(has_event(&logs, "owner_changed"));
    let config: Value = env.view(&vault, "get_config", json!({})).await?;
    assert_eq!(config["owner"], dao.as_str());

    // Keys alice issued do not survive the handover (#62); the DAO issues a new one.
    assert!(
        pay(&env, &vault, &card, &shop, 1, None).await.is_err(),
        "the previous owner's card key is deleted"
    );
    let secret = near_api::signer::generate_secret_key()?;
    let card = CardKey {
        public_key: secret.public_key().to_string(),
        signer: near_api::Signer::from_secret_key(secret)?,
    };
    let rotate = function_call(
        &vault,
        "rotate_card_key",
        &json!({ "card_id": 0, "new_public_key": card.public_key, "gas_allowance": null }),
    );
    let logs = propose_and_approve(&env, &dao, &council, rotate).await?;
    assert!(has_event(&logs, "card_key_rotated"));

    // A payment above the threshold waits for the DAO.
    let decision: Value = pay(&env, &vault, &card, &shop, 50, None).await?.json()?;
    assert_eq!(decision["status"], "queued");
    let payment_id = decision["payment_id"].as_u64().unwrap_or_default();

    // Alice is no longer the owner and cannot approve.
    env.call(
        &alice,
        &vault,
        "approve_payment",
        json!({ "payment_id": payment_id }),
    )
    .send()
    .await?
    .assert_failure();

    let approve = function_call(
        &vault,
        "approve_payment",
        &json!({ "payment_id": payment_id }),
    );
    let logs = propose_and_approve(&env, &dao, &council, approve).await?;
    assert!(has_event(&logs, "payment_approved"));
    assert!(has_event(&logs, "payment_settled"));
    assert_eq!(balance(&env, &token, &shop).await?, 50 * UNIT);
    Ok(())
}

#[test]
fn base64_matches_the_standard_alphabet() {
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(br#"{"payment_id":0}"#), "eyJwYXltZW50X2lkIjowfQ==");
}
