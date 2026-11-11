import type { FunctionCall } from "@comatocard/sdk";
import { Account, getTransactionLastResult, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import type { Config } from "./config.js";
import type { Submit } from "./spend.js";

/**
 * Submits calls signed by the card key. The signer account is the vault: the card is a
 * function-call key on the vault account, so `signer_account_pk` identifies the card.
 */
export function cardSubmitter(config: Config): Submit {
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  const account = new Account(config.vaultId, provider, new KeyPairSigner(config.cardKey));
  return async (call: FunctionCall) => {
    const response = await account.callFunctionRaw({
      contractId: call.receiverId,
      methodName: call.methodName,
      args: call.args,
      gas: call.gas,
      deposit: call.deposit,
    });
    return { txHash: response.transaction.hash, result: getTransactionLastResult(response) };
  };
}
