"""Single shared-password helpers (pbkdf2, stdlib only).

Hash format is `pbkdf2_sha256.<iterations>.<salt>.<hash>` — dots instead of
`$` so docker-compose / .env interpolation cannot truncate it.

Generate a hash for .env / server env:
    python -m app.utils.password "your-password"
"""
import hashlib
import hmac
import secrets
import sys

ALGO = "pbkdf2_sha256"
ITERATIONS = 200_000
SEP = "."


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f"{ALGO}{SEP}{ITERATIONS}{SEP}{salt}{SEP}{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.replace("$", SEP).split(SEP)
        if len(parts) != 4:
            return False
        algo, iters, salt, hexhash = parts
        if algo != ALGO:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), hexhash)
    except Exception:
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.utils.password "your-password"')
        sys.exit(1)
    print(hash_password(sys.argv[1]))
