#!/usr/bin/env bash
# Deploys the Comatocard contracts to NEAR testnet.
#
# Usage: ROOT_ACCOUNT=<you>.testnet scripts/deploy-testnet.sh
#
# Requires near-cli-rs, cargo-near and a full access key for ROOT_ACCOUNT in the legacy keychain
# (~/.near-credentials/testnet). The root account needs about 35 NEAR: publishing the vault as a
# global contract burns 10 NEAR per 100 kB of code. Steps that are already done are skipped, so
# the script can be rerun after a failure.
set -euo pipefail

ROOT_ACCOUNT="${ROOT_ACCOUNT:?set ROOT_ACCOUNT, for example comatocard.testnet}"
NETWORK="testnet"
RPC_URL="${RPC_URL:-https://rpc.testnet.near.org}"
TOKEN="tusd.${ROOT_ACCOUNT}"
REGISTRY="registry.${ROOT_ACCOUNT}"
FACTORY="factory.${ROOT_ACCOUNT}"
TOKEN_FUNDING="${TOKEN_FUNDING:-2 NEAR}"
REGISTRY_FUNDING="${REGISTRY_FUNDING:-2.2 NEAR}"
FACTORY_FUNDING="${FACTORY_FUNDING:-30.3 NEAR}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="${REPO_ROOT}/target/near"

log() { printf '\n==> %s\n' "$*"; }

rpc_query() {
  curl -sS "${RPC_URL}" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"deploy\",\"method\":\"query\",\"params\":$1}"
}

account_exists() {
  rpc_query "{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}" |
    grep -q '"code_hash"'
}

has_code() {
  local response
  response="$(rpc_query "{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}")"
  grep -q '"code_hash"' <<<"${response}" &&
    ! grep -q '"code_hash":"11111111111111111111111111111111"' <<<"${response}"
}

view() {
  local args
  args="$(printf '%s' "$3" | base64 | tr -d '\n')"
  rpc_query "{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"${args}\"}" |
    python3 -I -c 'import json, sys; print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
}

create_subaccount() {
  local account="$1" funding="$2"
  if account_exists "${account}"; then
    echo "${account} exists, skipping creation"
    return
  fi
  near account create-account fund-myself "${account}" "${funding}" \
    autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-legacy-keychain send
}

deploy() {
  local account="$1" wasm="$2" init_args="$3"
  if has_code "${account}"; then
    echo "${account} already has code, skipping deployment"
    return
  fi
  near contract deploy "${account}" use-file "${wasm}" \
    with-init-call new json-args "${init_args}" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
    network-config "${NETWORK}" sign-with-legacy-keychain send
}

call_as_root() {
  local contract="$1" method="$2"
  shift 2
  near contract call-function as-transaction "${contract}" "${method}" "$@" \
    prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' \
    sign-as "${ROOT_ACCOUNT}" network-config "${NETWORK}" sign-with-legacy-keychain send
}

log "Building contracts"
(cd "${REPO_ROOT}" && pnpm turbo run build --filter='./contracts/*' --output-logs=errors-only)

log "Creating accounts under ${ROOT_ACCOUNT}"
create_subaccount "${TOKEN}" "${TOKEN_FUNDING}"
create_subaccount "${REGISTRY}" "${REGISTRY_FUNDING}"
create_subaccount "${FACTORY}" "${FACTORY_FUNDING}"

log "Deploying contracts"
deploy "${TOKEN}" "${WASM_DIR}/mock_ft/mock_ft.wasm" '{}'
deploy "${REGISTRY}" "${WASM_DIR}/registry/registry.wasm" "{\"owner\":\"${ROOT_ACCOUNT}\"}"
deploy "${FACTORY}" "${WASM_DIR}/factory/factory.wasm" \
  "{\"owner\":\"${ROOT_ACCOUNT}\",\"default_tokens\":[\"${TOKEN}\"],\"default_registry\":\"${REGISTRY}\"}"

log "Appointing ${ROOT_ACCOUNT} as registry curator"
if view "${REGISTRY}" list_curators '{}' | grep -q "\"${ROOT_ACCOUNT}\""; then
  echo "already a curator"
else
  call_as_root "${REGISTRY}" add_curator json-args "{\"account_id\":\"${ROOT_ACCOUNT}\"}"
fi

log "Publishing the vault code as a global contract"
expected_hash="$(python3 -I -c '
import hashlib, sys
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
digest = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
n = int.from_bytes(digest, "big")
out = ""
while n:
    n, r = divmod(n, 58)
    out = alphabet[r] + out
print("1" * (len(digest) - len(digest.lstrip(b"\0"))) + out)
' "${WASM_DIR}/vault/vault.wasm")"
if view "${FACTORY}" get_config '{}' | grep -q "\"${expected_hash}\""; then
  echo "vault code ${expected_hash} already published"
else
  call_as_root "${FACTORY}" publish_vault_code file-args "${WASM_DIR}/vault/vault.wasm"
fi

log "Done"
echo "token:     ${TOKEN}"
echo "registry:  ${REGISTRY}"
echo "factory:   ${FACTORY}"
echo "vault code ${expected_hash}"
view "${FACTORY}" get_config '{}'
