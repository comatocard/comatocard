import { type AccountId, type FunctionCall, ONE_YOCTO } from "@comatocard/sdk";

/** The factory's minimum deposit, 0.5 NEAR; it becomes the vault balance for storage and card gas. */
export const VAULT_DEPOSIT = "500000000000000000000000";
/** NEP-145 registration on the test token. */
export const STORAGE_DEPOSIT = "1250000000000000000000";
const GAS_CREATE = "100000000000000";
const GAS_TOKEN = "30000000000000";
const GAS_TRANSFER_CALL = "100000000000000";

/** Vault name as an account label: lowercase letters, digits, `-` and `_`, no dots. */
export const VAULT_NAME = /^[a-z\d]+([-_][a-z\d]+)*$/;

export const createVaultCall = (factory: AccountId, name: string): FunctionCall => ({
  receiverId: factory,
  methodName: "create_vault",
  args: { name },
  gas: GAS_CREATE,
  deposit: VAULT_DEPOSIT,
});

/**
 * Funds a vault from the test token's faucet in one transaction to the token: register what is
 * missing, mint to the owner, then `ft_transfer_call` to the vault, which credits its ledger.
 * Minting straight to the vault would skip `ft_on_transfer` and leave the ledger untouched.
 */
export function topUpCalls(input: {
  token: AccountId;
  owner: AccountId;
  vault: AccountId;
  amount: string;
  ownerRegistered: boolean;
  vaultRegistered: boolean;
}): FunctionCall[] {
  const register = (account: AccountId): FunctionCall => ({
    receiverId: input.token,
    methodName: "storage_deposit",
    args: { account_id: account, registration_only: true },
    gas: GAS_TOKEN,
    deposit: STORAGE_DEPOSIT,
  });
  return [
    ...(input.vaultRegistered ? [] : [register(input.vault)]),
    ...(input.ownerRegistered ? [] : [register(input.owner)]),
    {
      receiverId: input.token,
      methodName: "mint",
      args: { account_id: input.owner, amount: input.amount },
      gas: GAS_TOKEN,
      deposit: "0",
    },
    {
      receiverId: input.token,
      methodName: "ft_transfer_call",
      args: { receiver_id: input.vault, amount: input.amount, msg: "" },
      gas: GAS_TRANSFER_CALL,
      deposit: ONE_YOCTO,
    },
  ];
}
