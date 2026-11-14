//! Idle balance lent to the real Rhea (Burrow) lending contract and recalled, against
//! near-sandbox. The venue is `testkit/fixtures/burrow.wasm`, the code of `contract.burrow.testnet`,
//! with the configuration of its testnet USDC asset (12 extra decimals).

use near_api::{AccountId, NearGas, NearToken};
use serde_json::{Value, json};
use testkit::comatocard::{UNIT, balance, deploy_token, deploy_vault, fund_vault, has_event, logs};
use testkit::{Env, fixture};

const EXTRA: u32 = 12;
// The minimums the vault accepts, so this test proves they cover the real venue.
const SUPPLY_GAS: NearGas = NearGas::from_tgas(100);
const RECALL_GAS: NearGas = NearGas::from_tgas(150);

struct World {
    env: Env,
    token: AccountId,
    vault: AccountId,
    owner: AccountId,
    keeper: AccountId,
    venue: AccountId,
}

async fn deploy_venue(
    env: &Env,
    owner: &AccountId,
    token: &AccountId,
) -> anyhow::Result<AccountId> {
    let config = json!({
        "oracle_account_id": owner,
        "pyth_oracle_account_id": owner,
        "ref_exchange_id": owner,
        "owner_id": owner,
        "booster_token_id": owner,
        "booster_decimals": 18,
        "max_num_assets": 20,
        "maximum_recency_duration_sec": 90,
        "maximum_staleness_duration_sec": 30,
        "lp_tokens_info_valid_duration_sec": 600,
        "pyth_price_valid_duration_sec": 60,
        "minimum_staking_duration_sec": 2_592_000,
        "maximum_staking_duration_sec": 7_776_000,
        "x_booster_multiplier_at_maximum_staking_duration": 30_000,
        "force_closing_enabled": true,
        "enable_price_oracle": true,
        "enable_pyth_oracle": false,
        "boost_suppress_factor": 1000,
    });
    let venue = env
        .deploy(
            "burrow",
            fixture("burrow.wasm")?,
            "new",
            json!({ "config": config }),
        )
        .await?;
    env.call(
        owner,
        &venue,
        "add_asset",
        json!({
            "token_id": token,
            "asset_config": {
                "reserve_ratio": 2500,
                "prot_ratio": 0,
                "target_utilization": 8000,
                "target_utilization_rate": "1000000000002440418605283556",
                "max_utilization_rate": "1000000000039724853136740579",
                "volatility_ratio": 9500,
                "extra_decimals": EXTRA,
                "can_deposit": true,
                "can_withdraw": true,
                "can_use_as_collateral": true,
                "can_borrow": true,
                "net_tvl_multiplier": 10000,
            },
        }),
    )
    .deposit(NearToken::from_yoctonear(1))
    .send()
    .await?
    .assert_success();
    // The venue holds the token, so it needs a storage deposit there.
    env.call(
        owner,
        token,
        "storage_deposit",
        json!({ "account_id": venue }),
    )
    .deposit(NearToken::from_millinear(10))
    .send()
    .await?
    .assert_success();
    Ok(venue)
}

async fn setup() -> anyhow::Result<World> {
    let env = Env::new().await?;
    let token = deploy_token(&env).await?;
    let owner = env.account("owner").await?;
    let keeper = env.account("keeper").await?;
    let vault = deploy_vault(&env, &owner, &token, None).await?;
    fund_vault(&env, &token, &owner, &vault, &[], 500).await?;
    let venue = deploy_venue(&env, &owner, &token).await?;
    env.call(
        &owner,
        &vault,
        "set_yield_venue",
        json!({ "venue": venue, "keeper": keeper }),
    )
    .send()
    .await?
    .assert_success();
    env.call(
        &owner,
        &vault,
        "set_yield_token",
        json!({ "token": token, "min_liquid": (100 * UNIT).to_string(), "extra_decimals": EXTRA }),
    )
    .send()
    .await?
    .assert_success();
    Ok(World {
        env,
        token,
        vault,
        owner,
        keeper,
        venue,
    })
}

impl World {
    async fn register_at_venue(&self) -> anyhow::Result<()> {
        let bounds: Value = self
            .env
            .view(&self.venue, "storage_balance_bounds", json!({}))
            .await?;
        let min: u128 = bounds["min"].as_str().unwrap_or("0").parse()?;
        self.env
            .call(
                &self.owner,
                &self.venue,
                "storage_deposit",
                json!({ "account_id": self.vault }),
            )
            .deposit(NearToken::from_yoctonear(min))
            .send()
            .await?
            .assert_success();
        Ok(())
    }

    async fn supply(
        &self,
        amount: u128,
    ) -> anyhow::Result<near_api::types::transaction::result::TransactionResult> {
        self.env
            .call(
                &self.keeper,
                &self.vault,
                "supply",
                json!({ "token": self.token, "amount": (amount * UNIT).to_string() }),
            )
            .gas(SUPPLY_GAS)
            .send()
            .await
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

    async fn lent(&self) -> anyhow::Result<(u128, bool)> {
        let view: Value = self.env.view(&self.vault, "get_yield", json!({})).await?;
        let token = &view["tokens"][0];
        Ok((
            token["supplied"].as_str().unwrap_or_default().parse()?,
            token["pending"].as_bool().unwrap_or(true),
        ))
    }

    /// What the venue holds for the vault, in token units.
    async fn at_venue(&self) -> anyhow::Result<u128> {
        let account: Value = self
            .env
            .view(
                &self.venue,
                "get_account",
                json!({ "account_id": self.vault }),
            )
            .await?;
        let inner: u128 = account["supplied"][0]["balance"]
            .as_str()
            .unwrap_or("0")
            .parse()?;
        Ok(inner / 10u128.pow(EXTRA))
    }
}

#[tokio::test]
async fn lends_to_rhea_and_recalls_with_the_vault_in_control() -> anyhow::Result<()> {
    let w = setup().await?;

    // Without a storage deposit at the venue the transfer is refused and nothing leaves.
    let refused = w.supply(50).await?.assert_success();
    assert!(has_event(&logs(&refused), "yield_supplied"));
    assert_eq!(w.available().await?, 500 * UNIT);
    assert_eq!(w.lent().await?, (0, false));

    w.register_at_venue().await?;
    let supplied = w.supply(300).await?.assert_success();
    assert!(has_event(&logs(&supplied), "yield_supplied"));
    assert_eq!(w.available().await?, 200 * UNIT);
    assert_eq!(w.lent().await?, (300 * UNIT, false));
    assert_eq!(w.at_venue().await?, 300 * UNIT);

    // 150 more would leave 50, below the 100 kept for cards.
    w.supply(150).await?.assert_failure();
    // Only the owner or the keeper may lend.
    w.env
        .call(
            &w.venue,
            &w.vault,
            "supply",
            json!({ "token": w.token, "amount": UNIT.to_string() }),
        )
        .gas(SUPPLY_GAS)
        .send()
        .await?
        .assert_failure();

    // Recall more than is lent: the vault takes what the venue holds, back into available.
    let recalled = w
        .env
        .call(
            &w.keeper,
            &w.vault,
            "recall",
            json!({ "token": w.token, "amount": (1_000 * UNIT).to_string() }),
        )
        .gas(RECALL_GAS)
        .send()
        .await?
        .assert_success();
    assert!(has_event(&logs(&recalled), "yield_recalled"));
    assert_eq!(w.lent().await?, (0, false));
    assert_eq!(w.at_venue().await?, 0);
    let available = w.available().await?;
    assert!(available >= 500 * UNIT, "available {available}");
    assert_eq!(balance(&w.env, &w.token, &w.vault).await?, available);
    Ok(())
}
