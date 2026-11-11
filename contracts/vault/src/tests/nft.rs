//! Cards as NEP-171 tokens.

use super::*;

#[test]
fn every_card_is_a_token_of_the_owner() {
    let harness = Harness::new();
    assert!(has_event("nft_mint"));
    let token = harness.vault.nft_token("0".to_owned()).unwrap();
    assert_eq!(token.owner_id, owner());
    assert_eq!(
        token.metadata.and_then(|m| m.title).as_deref(),
        Some("research agent")
    );
    assert_eq!(harness.vault.nft_total_supply().0, 1);
    assert_eq!(harness.vault.nft_supply_for_owner(owner()).0, 1);
    assert_eq!(harness.vault.nft_tokens(None, None).len(), 1);
    assert!(harness.vault.nft_token("7".to_owned()).is_none());
}

#[test]
fn transfer_removes_the_key_until_the_holder_sets_one() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    assert!(has_event("card_transferred") && has_event("nft_transfer"));
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(agent()));
    assert_eq!(
        harness.vault.nft_tokens_for_owner(agent(), None, None)[0].token_id,
        "0"
    );
    assert_eq!(harness.vault.nft_supply_for_owner(owner()).0, 0);

    harness.with_deposit(agent(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
    assert!(has_event("card_key_rotated"));
    harness.as_card(other_key());
    assert!(matches!(
        harness.vault.pay(shop(), U128(10), None, None),
        PaymentDecision::Submitted { .. }
    ));
}

#[test]
fn transfer_back_to_the_owner_follows_ownership() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.transfer(agent(), owner());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, None);
    assert_eq!(
        harness.vault.nft_token("0".to_owned()).unwrap().owner_id,
        owner()
    );
}

#[test]
#[should_panic(expected = "only the card holder may transfer the card")]
fn strangers_cannot_transfer() {
    let mut harness = Harness::new();
    harness.transfer(agent(), shop());
}

#[test]
#[should_panic(expected = "only the card holder may transfer the card")]
fn owner_cannot_take_back_a_transferred_card() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.transfer(owner(), shop());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfer_requires_one_yocto() {
    let mut harness = Harness::new();
    harness
        .vault
        .nft_transfer(agent(), "0".to_owned(), None, None);
}

#[test]
#[should_panic(expected = "attach at least 1 NEAR as the key allowance")]
fn holder_pays_the_key_allowance() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(agent(), NearToken::from_millinear(999));
    harness.vault.set_card_key(0, other_key());
}

#[test]
#[should_panic(expected = "only the card holder may set the key")]
fn only_the_holder_sets_the_key() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(shop(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
}

#[test]
fn revoke_burns_a_transferred_card() {
    let mut harness = Harness::new();
    harness.transfer(owner(), agent());
    harness.with_deposit(owner(), NearToken::from_yoctonear(0));
    harness.vault.revoke_card(0);
    assert!(has_event("nft_burn"));
    assert!(harness.vault.nft_token("0".to_owned()).is_none());
    assert_eq!(harness.vault.nft_total_supply().0, 0);
}

#[test]
fn transfer_call_keeps_the_token_when_the_receiver_accepts() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    let accepted = near_sdk::PromiseResult::Successful(b"false".to_vec());
    assert!(resolve(&mut harness, accepted));
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(agent()));
}

#[test]
fn transfer_call_returns_the_token_when_the_receiver_refuses_or_fails() {
    for result in [
        near_sdk::PromiseResult::Successful(b"true".to_vec()),
        near_sdk::PromiseResult::Failed,
    ] {
        let mut harness = Harness::new();
        harness.with_deposit(owner(), NearToken::from_yoctonear(1));
        let _ = harness
            .vault
            .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
        assert!(!resolve(&mut harness, result));
        let card = harness.vault.get_card(0).unwrap();
        assert_eq!(card.holder, None);
        assert_eq!(card.public_key, None, "the handed over key stays deleted");
    }
}

#[test]
fn returned_token_drops_the_key_the_receiver_set_meanwhile() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    harness.with_deposit(agent(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(0, other_key());
    let PaymentDecision::Queued { payment_id, .. } = ({
        harness.as_card(other_key());
        harness.vault.pay(shop(), U128(60), None, None)
    }) else {
        panic!("large payment should be queued");
    };
    assert!(!resolve(
        &mut harness,
        near_sdk::PromiseResult::Successful(b"true".to_vec())
    ));
    assert!(harness.vault.get_card_by_key(other_key()).is_none());
    assert!(harness.vault.get_payment(payment_id).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().holder, None);
}

#[test]
fn resolve_keeps_a_token_the_receiver_already_passed_on() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    let _ = harness
        .vault
        .nft_transfer_call(agent(), "0".to_owned(), None, None, String::new());
    harness.transfer(agent(), shop());
    assert!(resolve(&mut harness, near_sdk::PromiseResult::Failed));
    assert_eq!(harness.vault.get_card(0).unwrap().holder, Some(shop()));
}

#[test]
fn metadata_follows_nep_177() {
    use near_contract_standards::non_fungible_token::metadata::NonFungibleTokenMetadataProvider;
    let harness = Harness::new();
    let metadata = harness.vault.nft_metadata();
    metadata.assert_valid();
    assert_eq!(metadata.spec, "nft-1.0.0");
    let token = harness.vault.nft_token("0".to_owned()).unwrap();
    token.metadata.unwrap().assert_valid();
}

#[test]
#[should_panic(expected = "approvals are not supported")]
fn approvals_are_rejected() {
    let mut harness = Harness::new();
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    harness
        .vault
        .nft_transfer(agent(), "0".to_owned(), Some(1), None);
}
