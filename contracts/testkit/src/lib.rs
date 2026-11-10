//! Shared helpers for contract integration tests running against `near-sandbox`.
//!
//! Every test starts its own sandbox through [`Env::new`]. Contract wasm files are read from
//! `target/near`, where the `build` task puts them.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use near_api::types::transaction::result::TransactionResult;
use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sandbox::Sandbox;
use near_sandbox::config::{DEFAULT_GENESIS_ACCOUNT, DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use serde_json::Value;

/// Initial balance of every account created by [`Env::account`].
pub const DEFAULT_BALANCE: NearToken = NearToken::from_near(100);

/// A running sandbox with a signer that controls every account it creates.
pub struct Env {
    pub sandbox: Sandbox,
    pub network: NetworkConfig,
    pub signer: Arc<Signer>,
}

impl Env {
    /// Starts a fresh sandbox.
    ///
    /// # Errors
    /// Fails when the sandbox binary cannot be started or the genesis key cannot be parsed.
    pub async fn new() -> Result<Self> {
        let sandbox = Sandbox::start_sandbox().await.context("start sandbox")?;
        let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        Ok(Self {
            sandbox,
            network,
            signer,
        })
    }

    /// Creates `<name>.sandbox` with [`DEFAULT_BALANCE`] and the genesis key as full access key.
    ///
    /// # Errors
    /// Fails when the account already exists or the sandbox RPC rejects the request.
    pub async fn account(&self, name: &str) -> Result<AccountId> {
        let account_id: AccountId = format!("{name}.{DEFAULT_GENESIS_ACCOUNT}").parse()?;
        self.sandbox
            // near-sandbox and near-api depend on different near-account-id majors.
            .create_account(account_id.as_str().parse()?)
            .initial_balance(DEFAULT_BALANCE)
            .send()
            .await
            .with_context(|| format!("create account {account_id}"))?;
        Ok(account_id)
    }

    /// Creates `<name>.sandbox`, deploys `wasm` to it and calls `init_method` with `args`.
    ///
    /// # Errors
    /// Fails when account creation, deployment or initialization fails.
    pub async fn deploy(
        &self,
        name: &str,
        wasm: Vec<u8>,
        init_method: &str,
        args: Value,
    ) -> Result<AccountId> {
        let account_id = self.account(name).await?;
        near_api::Contract::deploy(account_id.clone())
            .use_code(wasm)
            .with_init_call(init_method, args)?
            .with_signer(self.signer.clone())
            .send_to(&self.network)
            .await?
            .assert_success();
        Ok(account_id)
    }

    /// Starts a function call from `signer_id` to `contract`. By default it is signed with the
    /// genesis key, which controls every account created here, attaches no deposit and the
    /// maximum gas.
    pub fn call(
        &self,
        signer_id: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> Call<'_> {
        Call {
            env: self,
            signer_id: signer_id.clone(),
            signer: self.signer.clone(),
            contract: contract.clone(),
            method: method.to_owned(),
            args,
            deposit: NearToken::from_yoctonear(0),
            gas: NearGas::from_tgas(300),
        }
    }

    /// Calls a view method and deserializes the result.
    ///
    /// # Errors
    /// Fails when the call fails or the result does not match `T`.
    pub async fn view<T: serde::de::DeserializeOwned + Send + Sync>(
        &self,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> Result<T> {
        Ok(near_api::Contract(contract.clone())
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.network)
            .await?
            .data)
    }
}

/// A function call under construction, see [`Env::call`].
#[must_use = "a call does nothing until it is sent"]
pub struct Call<'a> {
    env: &'a Env,
    signer_id: AccountId,
    signer: Arc<Signer>,
    contract: AccountId,
    method: String,
    args: Value,
    deposit: NearToken,
    gas: NearGas,
}

impl Call<'_> {
    pub fn deposit(mut self, deposit: NearToken) -> Self {
        self.deposit = deposit;
        self
    }

    pub fn gas(mut self, gas: NearGas) -> Self {
        self.gas = gas;
        self
    }

    /// Signs with `signer` instead of the genesis key, for example with a card key.
    pub fn signer(mut self, signer: Arc<Signer>) -> Self {
        self.signer = signer;
        self
    }

    /// Sends the transaction and waits for its final outcome.
    ///
    /// # Errors
    /// Fails when the transaction is rejected before execution, for example when the access key
    /// does not allow the method. Execution failures are returned inside the result.
    pub async fn send(self) -> Result<TransactionResult> {
        Ok(near_api::Contract(self.contract)
            .call_function(&self.method, self.args)
            .transaction()
            .deposit(self.deposit)
            .gas(self.gas)
            .with_signer(self.signer_id, self.signer)
            .send_to(&self.env.network)
            .await?)
    }
}

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("testkit lives in contracts/testkit")
        .to_path_buf()
}

/// Reads the wasm of `contracts/<name>` built by `cargo near build`.
///
/// Contracts are built by the `build` task before `test:integration` runs (see `turbo.json`).
/// Building from inside a test would contend for the cargo lock of the running test.
///
/// # Errors
/// Fails when the artifact is missing.
pub fn wasm(name: &str) -> Result<Vec<u8>> {
    let crate_name = name.replace('-', "_");
    let path = workspace_root()
        .join("target")
        .join("near")
        .join(&crate_name)
        .join(format!("{crate_name}.wasm"));
    std::fs::read(&path).with_context(|| {
        format!(
            "missing {}, run `pnpm turbo run build --filter=@comatocard/{name}` first",
            path.display()
        )
    })
}
