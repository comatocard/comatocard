//! Idle balance lent to a venue and recalled. The harness vault holds 1 000 of `usd.near`.

use crate::ext::{VenueAccount, VenueAsset, VenueAssetConfig, VenueAssetSettings};

use super::*;

fn venue() -> AccountId {
    id("lending.near")
}

fn keeper() -> AccountId {
    id("keeper.near")
}

/// Extra decimals of the token at the venue, as for USDC on Rhea.
const EXTRA: u8 = 12;
const SCALE: u128 = 1_000_000_000_000;

fn lending() -> Harness {
    let mut harness = Harness::new();
    harness.vault.set_yield_venue(Some(venue()), Some(keeper()));
    harness.vault.set_yield_token(token(), U128(300));
    harness
}

fn asset() -> VenueAssetConfig {
    VenueAssetConfig {
        config: VenueAssetSettings {
            extra_decimals: EXTRA,
        },
    }
}

fn at_venue(balance: u128) -> VenueAccount {
    VenueAccount {
        supplied: vec![VenueAsset {
            token_id: token(),
            balance: U128(balance * SCALE),
        }],
    }
}

impl Harness {
    fn as_vault(&mut self) {
        self.as_account(vault_id());
    }

    fn supplied(&self) -> u128 {
        self.vault.get_yield().tokens[0].supplied.0
    }

    fn pending(&self) -> bool {
        self.vault.get_yield().tokens[0].pending
    }
}

#[test]
fn supply_moves_available_to_the_venue_and_keeps_what_it_accepts() {
    let mut harness = lending();
    harness.as_account(keeper());
    harness.vault.supply(token(), U128(600));
    assert_eq!(harness.available(), 400);
    assert!(harness.pending());

    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(600), Ok(U128(600)));
    assert_eq!(harness.available(), 400);
    assert_eq!(harness.supplied(), 600);
    assert!(!harness.pending());
    assert!(has_event("yield_supplied"));
}

#[test]
fn supply_returns_what_the_venue_refused() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(600));
    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(600), Ok(U128(250)));
    assert_eq!(harness.available(), 750);
    assert_eq!(harness.supplied(), 250);

    harness.as_account(owner());
    harness.vault.supply(token(), U128(100));
    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(100), Err(PromiseError::Failed));
    assert_eq!(harness.available(), 750);
    assert_eq!(harness.supplied(), 250);
}

#[test]
#[should_panic(expected = "supply would leave less than min_liquid available")]
fn supply_keeps_min_liquid_for_cards() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(701));
}

#[test]
#[should_panic(expected = "only the owner or the keeper may call this method")]
fn strangers_cannot_supply() {
    let mut harness = lending();
    harness.as_account(shop());
    harness.vault.supply(token(), U128(100));
}

#[test]
#[should_panic(expected = "a lending operation is in flight for this token")]
fn one_operation_at_a_time() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(100));
    harness.vault.recall(token(), U128(100));
}

#[test]
fn recall_takes_back_principal_and_interest() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(600));
    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(600), Ok(U128(600)));

    harness.as_account(keeper());
    harness.vault.recall(token(), U128(10_000));
    assert!(harness.pending());
    // The venue holds 612 with interest; the vault withdraws all of it.
    harness.as_vault();
    harness.vault.on_yield_account(
        token(),
        U128(10_000),
        Ok(Some(at_venue(612))),
        Ok(Some(asset())),
    );
    assert!(harness.pending());
    harness.vault.on_yield_recalled(token(), U128(612), Ok(()));
    assert_eq!(harness.available(), 1_012);
    assert_eq!(harness.supplied(), 0);
    assert!(!harness.pending());
    assert!(has_event("yield_recalled"));
}

#[test]
fn recall_credits_nothing_when_the_venue_holds_nothing_or_fails() {
    let mut harness = lending();
    harness.vault.recall(token(), U128(100));
    harness.as_vault();
    harness
        .vault
        .on_yield_account(token(), U128(100), Ok(None), Ok(Some(asset())));
    assert!(!harness.pending());
    assert_eq!(harness.available(), 1_000);

    harness.as_account(owner());
    harness.vault.recall(token(), U128(100));
    harness.as_vault();
    harness
        .vault
        .on_yield_recalled(token(), U128(100), Err(PromiseError::Failed));
    assert!(!harness.pending());
    assert_eq!(harness.available(), 1_000);
}

#[test]
#[should_panic(expected = "recall every token before changing the venue")]
fn venue_stays_while_funds_are_lent() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(100));
    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(100), Ok(U128(100)));
    harness.as_account(owner());
    harness.vault.set_yield_venue(Some(id("other.near")), None);
}

#[test]
fn owner_can_clear_a_stuck_operation() {
    let mut harness = lending();
    harness.vault.recall(token(), U128(100));
    harness.as_account(owner());
    harness.vault.clear_yield_pending(token());
    assert!(!harness.pending());
}

#[test]
fn recall_moves_nothing_without_the_venue_asset_configuration() {
    let mut harness = lending();
    harness.vault.supply(token(), U128(600));
    harness.as_vault();
    harness
        .vault
        .on_yield_supplied(token(), U128(600), Ok(U128(600)));
    harness.as_account(owner());
    harness.vault.recall(token(), U128(600));
    harness.as_vault();
    harness.vault.on_yield_account(
        token(),
        U128(600),
        Ok(Some(at_venue(600))),
        Err(PromiseError::Failed),
    );
    assert!(!harness.pending());
    assert_eq!(harness.available(), 400);
    assert_eq!(harness.supplied(), 600);
}
