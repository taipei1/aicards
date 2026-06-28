import os
from pathlib import Path
from datetime import datetime, timezone
import re
from typing import Dict, List, Optional

class ObsidianSyncService:
    def __init__(self, folder_path: str):
        self.folder_path = Path(folder_path)
    
    def parse_markdown(self, file_path: str) -> Optional[Dict]:
        """Extract metadata and content from .md file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            return None
        
        # Extract YAML frontmatter
        frontmatter = {}
        tags = []
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                try:
                    # Simple YAML parsing without pyyaml
                    for line in parts[1].strip().split('\n'):
                        if ':' in line:
                            key, value = line.split(':', 1)
                            frontmatter[key.strip()] = value.strip().strip('"').strip("'")
                    content = parts[2]
                    # Extract tags from frontmatter
                    if 'tags' in frontmatter:
                        fm_tags = frontmatter['tags']
                        # Handle "tags: srs" (single) and "tags: [srs, eng]" (list)
                        if fm_tags.startswith('[') and fm_tags.endswith(']'):
                            tags = [t.strip().strip('"').strip("'") for t in fm_tags[1:-1].split(',') if t.strip()]
                        else:
                            tags = [fm_tags]
                except Exception:
                    pass
        
        # Extract inline hashtags as tags
        inline_tags = re.findall(r'#(\w+)', content)
        tags = list(set(tags + inline_tags))
        
        # Get file timestamps
        stat = os.stat(file_path)
        
        return {
            "file_path": file_path,
            "content": content.strip(),
            "tags": list(set(tags)),
            "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc),
            "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            "frontmatter": frontmatter
        }
    
    def scan_folder(self) -> List[Dict]:
        """Scan folder for all .md files."""
        notes = []
        if not self.folder_path.exists():
            print(f"Folder not found: {self.folder_path}")
            return notes
        
        for md_file in self.folder_path.rglob("*.md"):
            try:
                note = self.parse_markdown(str(md_file))
                if note:
                    notes.append(note)
            except Exception as e:
                print(f"Error parsing {md_file}: {e}")
        
        return notes
    
    def get_file_hash(self, file_path: str) -> str:
        """Get file modification time as change indicator."""
        try:
            stat = os.stat(file_path)
            return str(int(stat.st_mtime))
        except Exception:
            return "0"
