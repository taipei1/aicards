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
        for row in all_docs.get("rows", []):
            doc = row.get("doc", {})
            doc_id = doc.get("_id", "")

            # Skip design docs
            if doc_id.startswith("_design"):
                continue
            # Skip non-leaf docs
            if doc.get("type") not in (None, "leaf"):
                continue

            # Get file path - in Self-hosted LiveSync, the data contains the actual note content
            # but paths are stored differently. Let's use the stored_id or generate from doc_id
            data = doc.get("data", "").strip()
            if not data:
                continue

            # Self-hosted LiveSync stores notes with id format like "h:xxxxx"
            # The actual filename might be elsewhere. Try to get it from metadata
            stored_id = doc.get("stored_id", doc_id)
            
            # Use doc_id as filename (less useful but works)
            # Self-hosted LiveSync stores files under vault root
            # The metadata might contain the path, let's look for it
            file_path = None
            
            # Try to find file path in various fields
            if doc.get("file_path"):
                file_path = doc["file_path"]
            elif doc.get("path"):
                file_path = doc["path"]
            elif doc.get("relativePath"):
                file_path = doc["relativePath"]
            elif doc.get("metadata", {}).get("file_path"):
                file_path = doc["metadata"]["file_path"]
            
            # If we have no path, generate one from content (first line as title)
            if not file_path:
                first_line = data.strip().split("\n")[0].strip()
                # Remove markdown heading markers
                title = first_line.lstrip("#").strip()
                if not title:
                    title = doc_id.replace(":", "_").replace("/", "_")[:50]
                # Clean title for filename
                title = "".join(c for c in title if c.isalnum() or c in " -_").strip()
                if not title:
                    title = f"note-{doc_id[-8:]}"
                file_path = f"{title}.md"

            # Only process markdown files
            if not file_path.endswith(".md"):
                file_path = file_path + ".md"

            # The data field already contains the full markdown content
            content = data

            # Strip vault root prefix from path
            clean_path = file_path.lstrip("/")
            full_path = output_dir / clean_path

            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

            written += 1
            print(f"[CouchDBSync] Written: {clean_path}")

        print(f"[CouchDBSync] Done. {written} files written to {output_dir}")
        return written

