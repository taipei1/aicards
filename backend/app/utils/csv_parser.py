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
        """
        reader = csv.DictReader(io.StringIO(content))
        cards = []
        
        for row in reader:
            front = (row.get("front") or row.get("word") or "").strip()
            back = (row.get("back") or row.get("translation") or "").strip()
            hint = (row.get("hint") or row.get("подсказка") or "").strip()
            
            # Extract hashtags from tags column or from hint
            tags_raw = (row.get("tags") or "").strip()
            tags = list(dict.fromkeys(t.strip().lower() for t in re.findall(r'#(\w+)', tags_raw)))
            if not tags:
                tags = list(dict.fromkeys(t.strip().lower() for t in re.findall(r'#(\w+)', hint)))
            
            cards.append({
                "front": front,
                "back": back,
                "hint": hint,
                "tags": tags,
                "published_at": (row.get("publishedAt") or ""),
            })
        
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
