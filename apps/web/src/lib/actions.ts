import type { FunctionCall } from "@comatocard/sdk";

/** The NEAR Connect shape of a function call action. */
export interface ConnectorFunctionCall {
  type: "FunctionCall";
  params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string };
}

export const toConnectorAction = (call: FunctionCall): ConnectorFunctionCall => ({
  type: "FunctionCall",
  params: { methodName: call.methodName, args: call.args, gas: call.gas, deposit: call.deposit },
});

/** One transaction per receiver, in order, for `signAndSendTransactions`. */
export function groupByReceiver(calls: FunctionCall[]) {
  const transactions: { receiverId: string; actions: ConnectorFunctionCall[] }[] = [];
  for (const call of calls) {
    const last = transactions.at(-1);
    if (last?.receiverId === call.receiverId) last.actions.push(toConnectorAction(call));
    else transactions.push({ receiverId: call.receiverId, actions: [toConnectorAction(call)] });
  }
  return transactions;
}
