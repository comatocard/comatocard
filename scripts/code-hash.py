"""Prints the NEAR code hash (base58 of the SHA-256) of each wasm file given as an argument."""

import hashlib
import sys

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + out


for path in sys.argv[1:]:
    with open(path, "rb") as wasm:
        print(f"{base58(hashlib.sha256(wasm.read()).digest())}  {path.removeprefix('./')}")
