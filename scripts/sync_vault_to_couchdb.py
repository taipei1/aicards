#!/usr/bin/env python3
"""
Sync Obsidian vault .md files with #srs tag → CouchDB.
Runs locally on the desktop, writes to the remote CouchDB.

Document IDs are flat (no slashes) to avoid proxy URL-encoding issues.
"""

import os
import json
import base64
import hashlib
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

# ─── config ──────────────────────────────────────────────────────────
VAULT_PATH = Path(os.environ.get("VAULT_PATH", "~/.config/obsidian/Obsidian Vault")).expanduser()

COUCHDB_URL = os.environ.get("COUCHDB_URL", "https://translatepls.me/couchdb/")
COUCHDB_USER = os.environ.get("COUCHDB_USER", "admin")
COUCHDB_PASS = os.environ.get("COUCHDB_PASS", "123")
COUCHDB_DB = os.environ.get("COUCHDB_DB", "obsidian-sync")

# ─── helpers ─────────────────────────────────────────────────────────

def _db_url(doc_id=None):
    """Build URL to CouchDB database."""
    base = f"{COUCHDB_URL.rstrip('/')}/{COUCHDB_DB}"
    if not doc_id:
        return base
    # URL-encode fully to handle any special chars
    encoded = urllib.parse.quote(doc_id, safe='')
    return f"{base}/{encoded}"

def _request(method, doc_id=None, data=None):
    """Send HTTP request to CouchDB."""
    url = _db_url(doc_id)
    req = urllib.request.Request(url, method=method, data=data)
    auth_str = base64.b64encode(f"{COUCHDB_USER}:{COUCHDB_PASS}".encode()).decode()
    req.add_header("Authorization", f"Basic {auth_str}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            return json.loads(body.decode()) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"error": e.code, "reason": body}
    except Exception as e:
        return {"error": "exception", "reason": str(e)}

def _doc_exists(doc_id):
    """Check if document exists, return (rev, doc) if yes."""
    result = _request("GET", doc_id)
    if isinstance(result, dict) and "_rev" in result:
        return result["_rev"], result
    return None, None

def _hash_content(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def _doc_id_for(relative_path):
    """Generate a flat, URL-safe document ID.
    
    Format: srs:{sha256_prefix}
    Where sha256_prefix = first 16 chars of SHA-256 of the path.
    This avoids all issues with slashes, Cyrillic, spaces in URLs.
    """
    path_str = str(relative_path)
    h = hashlib.sha256(path_str.encode("utf-8")).hexdigest()[:16]
    return f"srs:{h}"

# ─── sync ────────────────────────────────────────────────────────────

def sync_vault():
    print(f"Scanning {VAULT_PATH} …")
    if not VAULT_PATH.exists():
        print(f"ERROR: vault not found at {VAULT_PATH}")
        return False

    # Verify CouchDB connection
    info = _request("GET")
    if isinstance(info, dict) and "error" in info:
        print(f"ERROR: Cannot connect to CouchDB: {info}")
        return False
    print(f"CouchDB connected — {info.get('doc_count', '?')} documents, "
          f"{info.get('db_name', COUCHDB_DB)}")

    processed = 0
    skipped = 0
    errors = 0

    for md_file in sorted(VAULT_PATH.rglob("*.md")):
        relative = md_file.relative_to(VAULT_PATH)
        content = md_file.read_text(encoding="utf-8")

        # Only process files with #srs tag
        if "#srs" not in content:
            continue

        doc_id = _doc_id_for(relative)
        content_hash = _hash_content(content)

        # Check if already synced with same content
        existing_rev, existing_doc = _doc_exists(doc_id)
        if existing_rev:
            if existing_doc.get("content_hash") == content_hash:
                skipped += 1
                continue
            # Update existing — use its revision
            existing_doc["data"] = content
            existing_doc["content_hash"] = content_hash
            tags = existing_doc.get("tags", [])
            if "srs" not in tags:
                tags.append("srs")
            existing_doc["tags"] = tags
            body = json.dumps(existing_doc, ensure_ascii=False).encode("utf-8")
            result = _request("PUT", doc_id, body)
        else:
            # Create new
            doc = {
                "type": "leaf",
                "data": content,
                "path": str(relative),
                "content_hash": content_hash,
                "tags": ["srs"],
                "synced_at": None,
            }
            body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
            result = _request("PUT", doc_id, body)

        if isinstance(result, dict) and "ok" in result:
            processed += 1
            label = "Updated" if existing_rev else "Created"
            print(f"  {label}: {relative}")
        else:
            # Try to debug
            print(f"  ERROR {relative}: doc_id={doc_id}, result={result.get('error', result)}")
            errors += 1

    print(f"\nDone: {processed} synced, {skipped} unchanged, {errors} errors")
    return errors == 0

if __name__ == "__main__":
    success = sync_vault()
    exit(0 if success else 1)
