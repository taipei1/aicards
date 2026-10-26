"""Small text normalisation helpers shared by API schemas and imports."""
import re

_WHITESPACE = re.compile(r"\s+")


def normalize_spaces(value: str | None) -> str | None:
    """Collapse runs of spaces/tabs/newlines to one space and trim the edges.

    Single spaces inside a word stay intact: phrases like "dobrý deň" or
    "take off" are valid cards, but "  take   off  " is not.
    """
    if value is None:
        return None
    return _WHITESPACE.sub(" ", value.replace("\u00a0", " ")).strip()
