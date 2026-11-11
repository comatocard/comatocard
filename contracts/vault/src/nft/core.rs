//! NEP-171 core: `nft_transfer`, `nft_transfer_call`, `nft_token` and the transfer resolver.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver, ext_nft_receiver,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::{AccountId, Gas, PromiseOrValue, assert_one_yocto, env, near, serde_json};

use super::card_id;
use crate::{Vault, VaultExt};

/// Gas reserved for `nft_resolve_transfer`. A revert is a full handover that declines up to
/// [`crate::types::MAX_QUEUED_PER_CARD`] payments, so it needs more than the 5 Tgas of
/// `near-contract-standards`.
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(20);

#[near]
impl NonFungibleTokenCore for Vault {
    /// Moves the card token to `receiver_id`, deletes the card key and declines the queued
    /// payments of the card, so nothing the previous holder asked for can be approved later. The
    /// card is unusable until the new holder calls `set_card_key`.
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        self.transfer_card(&receiver_id, &token_id, approval_id, memo.as_deref());
    }

    /// Transfers the token and calls `nft_on_transfer` on the receiver. When the receiver asks for
    /// the token back, it returns to the previous holder; the card key stays deleted.
    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let previous = self.transfer_card(&receiver_id, &token_id, approval_id, memo.as_deref());
        ext_nft_receiver::ext(receiver_id.clone())
            .with_unused_gas_weight(1)
            .nft_on_transfer(
                env::predecessor_account_id(),
                previous.clone(),
                token_id.clone(),
                msg,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_TRANSFER)
                    .with_unused_gas_weight(0)
                    .nft_resolve_transfer(previous, receiver_id, token_id, None),
            )
            .into()
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        let id = token_id.parse().ok()?;
        self.live_card(id).map(|card| self.token(card))
    }
}

#[near]
impl NonFungibleTokenResolver for Vault {
    /// Returns the token to `previous_owner_id` when the receiver asked for it back or failed,
    /// unless the receiver already moved it or the card was revoked. Returns whether the
    /// transfer stands.
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let _ = approved_account_ids;
        let must_revert = env::promise_result_checked(0, "false".len())
            .ok()
            .and_then(|value| serde_json::from_slice(&value).ok())
            .unwrap_or(true);
        let id = card_id(&token_id);
        let still_held = self
            .live_card(id)
            .is_some_and(|card| self.holder(card) == receiver_id);
        if !must_revert || !still_held {
            return true;
        }
        // A full handover: a key or payment the receiver set up while holding the token must not
        // survive the return.
        self.hand_over(id, &receiver_id, &previous_owner_id, None);
        false
    }
}
