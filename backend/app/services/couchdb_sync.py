import os
import json
import base64
import urllib.request
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional


class CouchDBSyncService:
    """
    Syncs Obsidian vault files from CouchDB (Self-hosted LiveSync)
    into a local folder so aicards can scan them.
    """

    def __init__(self, couchdb_url: str, username: str, password: str, db_name: str):
        self.base_url = couchdb_url.rstrip("/")
        self.username = username
        self.password = password
        self.db_name = db_name

    def _request(self, path: str) -> Optional[dict]:
        url = f"{self.base_url}/{self.db_name}/{path}"
        req = urllib.request.Request(url)
        
        # Add basic auth
        auth_str = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {auth_str}")
        
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            print(f"[CouchDBSync] Request failed: {url} — {e}")
            return None

    def _is_binary_content(self, data: str) -> bool:
        """Check if data is likely binary (base64-encoded image, etc.)"""
        if not data:
            return True
        # Check for base64-encoded image headers
        stripped = data.strip()
        if stripped.startswith("iVBORw0KGgo"):  # PNG
            return True
        if stripped.startswith("/9j/"):  # JPEG
            return True
        if stripped.startswith("JVBERi0"):  # PDF
            return True
        # If more than 80% of characters are non-printable/non-ASCII, likely binary
        non_printable = sum(1 for c in stripped[:1000] if ord(c) < 32 and c not in "\n\r\t")
        if non_printable > 100:
            return True
        return False

    def fetch_vault_as_files(self, output_dir: Path) -> int:
        """
        Fetch all markdown documents from CouchDB and write them to output_dir.
        Returns the number of files written (only .md files with content).
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        all_docs = self._request("_all_docs?include_docs=true")
        if not all_docs:
            print("[CouchDBSync] No documents found.")
            return 0

        written = 0
        errors = 0
        for row in all_docs.get("rows", []):
            doc = row.get("doc", {})
            doc_id = doc.get("_id", "")

            # Skip design docs
            if doc_id.startswith("_design"):
                continue
            # Skip non-leaf docs
            if doc.get("type") not in (None, "leaf"):
                continue

            # Get content
            data = doc.get("data", "").strip()
            if not data:
                continue

            # Skip binary content (images, etc.)
            if self._is_binary_content(data):
                continue

            # Generate a safe filename from doc_id
            safe_id = doc_id.replace(":", "_").replace("/", "_").replace(" ", "_")
            if len(safe_id) > 60:
                safe_id = safe_id[:60]
            
            # Try to find a meaningful filename from content first line
            first_line = data.strip().split("\n")[0].strip()
            title = first_line.lstrip("#").strip()
            if title and len(title) < 80 and not self._is_binary_content(title):
                # Clean title for filename
                title = "".join(c for c in title if c.isalnum() or c in " -_()[]").strip()
                if title:
                    if len(title) > 80:
                        title = title[:80]
                    file_path = f"{safe_id[:20]}_{title}.md"
                else:
                    file_path = f"{safe_id}.md"
            else:
                file_path = f"{safe_id}.md"

            full_path = output_dir / file_path

            try:
                full_path.parent.mkdir(parents=True, exist_ok=True)
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(data)
                written += 1
            except OSError as e:
                print(f"[CouchDBSync] Error writing {file_path}: {e}")
                errors += 1
                # Fallback: use short ID only
                fallback = f"note_{safe_id[:30]}.md"
                try:
                    with open(output_dir / fallback, "w", encoding="utf-8") as f:
                        f.write(data)
                    written += 1
                    print(f"[CouchDBSync] Written (fallback): {fallback}")
                except OSError as e2:
                    print(f"[CouchDBSync] Fallback also failed: {e2}")

        print(f"[CouchDBSync] Done. {written} files written, {errors} errors to {output_dir}")
        return written

