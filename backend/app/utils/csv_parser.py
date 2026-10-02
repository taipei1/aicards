import csv
import io
import re
from typing import List, Dict

class CSVParser:
    @staticmethod
    def parse_csv(content: str) -> List[Dict[str, str]]:
        """
        Parse CSV content from uploaded file or text.
        Expected columns: front (word), back (translation), hint (подсказка), tags (#tag1 #tag2), publishedAt (optional)
        Also handles Russian headers: Фраза-контекст, Перевод фразы, Слово — перевод. Пояснение
        Handles inconsistent quoting where fields contain commas but may not be quoted.
        Tags column is optional — missing tags default to empty list.
        """
        reader = csv.DictReader(io.StringIO(content))
        cards = []
        
        # Normalize headers: strip whitespace, handle Russian equivalents
        if reader.fieldnames:
            normalized = []
            for h in reader.fieldnames:
                h_stripped = h.strip() if h else ""
                if h_stripped in ("front", "word", "Фраза-контекст"):
                    normalized.append("front")
                elif h_stripped in ("back", "translation", "Перевод фразы"):
                    normalized.append("back")
                elif h_stripped in ("hint", "подсказка", "Слово — перевод. Пояснение"):
                    normalized.append("hint")
                elif h_stripped in ("tags",):
                    normalized.append("tags")
                elif h_stripped in ("publishedAt", "published_at"):
                    normalized.append("publishedAt")
                else:
                    normalized.append(h_stripped)
            reader.fieldnames = normalized
        
        for row in reader:
            front = (row.get("front") or row.get("word") or "").strip()
            back = (row.get("back") or row.get("translation") or "").strip()
            hint = (row.get("hint") or row.get("подсказка") or "").strip()
            
            tags_raw = (row.get("tags") or "").strip()
            tags = list(dict.fromkeys(t.strip().lower() for t in re.findall(r'#(\w+)', tags_raw))) if tags_raw else []
            
            cards.append({
                "front": front,
                "back": back,
                "hint": hint,
                "tags": tags,
                "published_at": (row.get("publishedAt") or ""),
            })
        
        return cards
    
    @staticmethod
    def _unquote(s: str) -> str:
        """Remove surrounding quotes from a string if present."""
        s = s.strip()
        if s.startswith('"') and s.endswith('"'):
            return s[1:-1]
        return s
    
    @staticmethod
    def parse_csv_lenient(content: str) -> List[Dict[str, str]]:
        """
        Lenient CSV parser for files with inconsistent quoting.
        Handles Russian column headers, optional tags, and unquoted commas inside fields.
        Falls back to content-based column detection when standard CSV parsing fails.
        """
        lines = content.strip().split('\n')
        if not lines:
            return []
        
        # Parse header to understand column mapping
        raw_header = lines[0]
        header_parts = raw_header.split(',')
        col_map = {}
        for i, h in enumerate(header_parts):
            h = h.strip().strip('"').strip()
            if h in ("front", "word", "Фраза-контекст"):
                col_map[i] = "front"
            elif h in ("back", "translation", "Перевод фразы"):
                col_map[i] = "back"
            elif h in ("hint", "подсказка", "Слово — перевод. Пояснение"):
                col_map[i] = "hint"
            elif h in ("tags",):
                col_map[i] = "tags"
        
        cyrillic = re.compile(r'[\u0400-\u04FF\u0500-\u052F]')
        cards = []
        
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
            
            # Try standard CSV parsing first
            try:
                reader = csv.reader(io.StringIO(line))
                row = next(reader)
            except:
                row = []
            
            # If we got 3 or 4 fields (matching header count), use it directly
            if len(row) == len(col_map):
                card = {"front": "", "back": "", "hint": "", "tags": [], "published_at": ""}
                for i, val in enumerate(row):
                    key = col_map.get(i)
                    if key == "front":
                        card["front"] = val.strip()
                    elif key == "back":
                        card["back"] = val.strip()
                    elif key == "hint":
                        card["hint"] = val.strip()
                    elif key == "tags":
                        tags_raw = val.strip()
                        card["tags"] = list(dict.fromkeys(
                            t.strip().lower() for t in re.findall(r'#(\w+)', tags_raw)
                        )) if tags_raw else []
                if card["front"] and card["back"]:
                    cards.append(card)
                continue
            
            # Standard parsing failed — use heuristic detection
            # Find hint column: it contains " — "
            dash_positions = [m.start() for m in re.finditer(' — ', line)]
            if not dash_positions:
                continue
            
            def split_front_back(before: str):
                """Split 'before' text into front and back using Cyrillic detection."""
                if before.startswith('"'):
                    end_fq = before.index('"', 1)
                    front = before[1:end_fq]
                    back_raw = before[end_fq + 1:].lstrip(', ')
                    back = CSVParser._unquote(back_raw)
                else:
                    parts = before.split(',')
                    front_parts = []
                    back_parts = []
                    in_back = False
                    for p in parts:
                        cyr_ratio = sum(1 for c in p if '\u0400' <= c <= '\u04FF' or '\u0500' <= c <= '\u052F') / max(len(p), 1)
                        if not in_back and cyr_ratio > 0.2:
                            in_back = True
                            back_parts.append(p)
                        elif in_back:
                            back_parts.append(p)
                        else:
                            front_parts.append(p)
                    if not back_parts and front_parts:
                        back_parts = [front_parts.pop()]
                    front = ','.join(front_parts).strip()
                    back = CSVParser._unquote(','.join(back_parts).strip())
                return front, back
            
            # Check if hint is quoted at the end
            if line.rstrip().endswith('"'):
                last_quote = line.rstrip().rfind('"')
                prev_quote = line.rfind('"', 0, last_quote)
                if prev_quote >= 0:
                    hint = line[prev_quote:last_quote + 1].strip('"')
                    before = line[:prev_quote].rstrip(', ')
                    front, back = split_front_back(before)
                    if front and back:
                        cards.append({"front": front, "back": back, "hint": hint, "tags": [], "published_at": ""})
                    continue
            
            # Unquoted hint — find by last dash
            last_dash = dash_positions[-1]
            word_start = last_dash - 1
            while word_start >= 0 and line[word_start] == ' ':
                word_start -= 1
            while word_start >= 0 and line[word_start] not in (',', '"'):
                word_start -= 1
            
            hint_start = word_start + 1
            before = line[:word_start].rstrip(', ').strip() if word_start >= 0 else ''
            hint = line[hint_start:].strip()
            
            if not before:
                continue
            
            front, back = split_front_back(before)
            if front and back:
                cards.append({"front": front, "back": back, "hint": hint, "tags": [], "published_at": ""})
        
        return cards
    
    @staticmethod
    def detect_language(text: str) -> str:
        """
        Simple language detection based on Cyrillic characters.
        Returns: 'en' or 'sk' (default to 'en')
        """
        # Count Cyrillic characters
        cyrillic_count = sum(1 for c in text if '\u0400' <= c <= '\u04FF')
        
        # If more than 30% are Cyrillic, it's likely a translation (Russian/Slovak)
        if cyrillic_count > len(text) * 0.3:
            return "en"  # English word with Russian translation
        return "sk"  # Default to Slovak
