//! Card management by the owner. Every card is a function-call key on the vault account that may
//! only call `pay`.

use near_sdk::json_types::U128;
use near_sdk::{NearToken, Promise, PublicKey, env, near, require};

use crate::types::{Card, CardId, CardKind, CardStatus, MAX_LABEL_LEN, Policy, Spend};
use crate::{DEFAULT_CARD_ALLOWANCE, Vault, VaultExt, events};

const PAY_METHOD: &str = "pay";

fn allowance(gas_allowance: Option<U128>) -> near_sdk::Allowance {
    let amount = gas_allowance.map_or(DEFAULT_CARD_ALLOWANCE, |value| {
        NearToken::from_yoctonear(value.0)
    });
    near_sdk::Allowance::limited(amount)
        .unwrap_or_else(|| env::panic_str("gas_allowance must be positive"))
}

fn add_card_key(public_key: PublicKey, gas_allowance: Option<U128>) {
    let vault = env::current_account_id();
    Promise::new(vault.clone())
        .add_access_key_allowance(public_key, allowance(gas_allowance), vault, PAY_METHOD)
        .detach();
}

#[near]
impl Vault {
    /// Issues a card bound to `public_key` and adds the key to the vault account.
    pub fn create_card(
        &mut self,
        public_key: PublicKey,
        label: String,
        kind: CardKind,
        policy: Policy,
        gas_allowance: Option<U128>,
    ) -> CardId {
        self.assert_owner();
        require!(
            !label.is_empty() && label.len() <= MAX_LABEL_LEN,
            "label must be 1 to 64 bytes"
        );
        if let Err(message) = policy.validate() {
            env::panic_str(message);
        }
        require!(
            !self.card_keys.contains_key(&public_key),
            "public key already belongs to a card"
        );
        let id = self.next_card_id;
        self.next_card_id = id
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("card id overflow"));
        let card = Card {
            id,
            label,
            kind,
            public_key: public_key.clone(),
            status: CardStatus::Active,
            policy,
            spend: Spend::default(),
            created_at: env::block_timestamp().into(),
        };
        events::card_created(id, &card.public_key, &card.label, kind, &card.policy);
        self.cards.insert(id, card);
        self.card_keys.insert(public_key.clone(), id);
        add_card_key(public_key, gas_allowance);
        id
    }

    /// Replaces the policy of a card that is not revoked. Spend counters are kept.
    pub fn update_policy(&mut self, card_id: CardId, policy: Policy) {
        self.assert_owner();
        if let Err(message) = policy.validate() {
            env::panic_str(message);
        }
        let card = self.card_mut(card_id);
        require!(card.status != CardStatus::Revoked, "card is revoked");
        card.policy = policy;
        events::card_policy_updated(card_id, &card.policy);
    }

    pub fn freeze_card(&mut self, card_id: CardId) {
        self.assert_owner();
        let card = self.card_mut(card_id);
        require!(card.status == CardStatus::Active, "card is not active");
        card.status = CardStatus::Frozen;
        events::card_status("card_frozen", card_id);
    }

    pub fn unfreeze_card(&mut self, card_id: CardId) {
        self.assert_owner();
        let card = self.card_mut(card_id);
        require!(card.status == CardStatus::Frozen, "card is not frozen");
        card.status = CardStatus::Active;
        events::card_status("card_unfrozen", card_id);
    }

    /// Revokes a card permanently and deletes its key. Queued payments of the card can no longer
    /// be approved; they are declined or expire.
    pub fn revoke_card(&mut self, card_id: CardId) {
        self.assert_owner();
        let card = self.card_mut(card_id);
        require!(
            card.status != CardStatus::Revoked,
            "card is already revoked"
        );
        card.status = CardStatus::Revoked;
        let public_key = card.public_key.clone();
        self.card_keys.remove(&public_key);
        Promise::new(env::current_account_id())
            .delete_key(public_key)
            .detach();
        events::card_status("card_revoked", card_id);
    }

    /// Replaces the key of a card, for example after a leak or when the allowance ran out.
    pub fn rotate_card_key(
        &mut self,
        card_id: CardId,
        new_public_key: PublicKey,
        gas_allowance: Option<U128>,
    ) {
        self.assert_owner();
        require!(
            !self.card_keys.contains_key(&new_public_key),
            "public key already belongs to a card"
        );
        let card = self.card_mut(card_id);
        require!(card.status != CardStatus::Revoked, "card is revoked");
        let old_public_key = std::mem::replace(&mut card.public_key, new_public_key.clone());
        self.card_keys.remove(&old_public_key);
        self.card_keys.insert(new_public_key.clone(), card_id);
        Promise::new(env::current_account_id())
            .delete_key(old_public_key.clone())
            .detach();
        add_card_key(new_public_key.clone(), gas_allowance);
        events::card_key_rotated(card_id, &old_public_key, &new_public_key);
    }
}
