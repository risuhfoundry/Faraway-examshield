from __future__ import annotations

import os
import re
from typing import Any


def _detect_threshold() -> float:
    return float(os.environ.get("EXAMSHIELD_DETECT_THRESHOLD", "7"))


def _severity_thresholds() -> tuple[float, float, float]:
    critical = float(os.environ.get("EXAMSHIELD_DETECT_CRITICAL_SCORE", "25"))
    high = float(os.environ.get("EXAMSHIELD_DETECT_HIGH_SCORE", "15"))
    medium = float(os.environ.get("EXAMSHIELD_DETECT_MEDIUM_SCORE", "7"))
    return critical, high, medium

# Keyword patterns: (pattern, weight, category, description)
# weight: 1-10 impact on score
# category: leak|cheat|shady|general
KEYWORD_PATTERNS: list[tuple[str, int, str, str]] = [
    # Direct exam leak terms
    (r"\b(neet|jee|upsc|gate|cbse)\s*(paper|answer|solution|key)\b", 9, "leak", "Exam paper leak"),
    (r"\bquestion\s*paper\s+(leaked?|pdf)\b", 9, "leak", "Question paper leak"),
    (r"\b(exam|paper)\s*(leaked?|hacked|compromised)\b", 9, "leak", "Exam compromise"),
    (r"\bleaked\s*(paper|answer|solution|key)\b", 8, "leak", "Leaked content"),
    (r"\bsend\s+(me\s+)?(the\s+)?(answer|solution|paper|key)\b", 7, "cheat", "Requesting answers"),
    (r"\bshare\s+(the\s+)?(answer|solution|paper|key)\b", 7, "cheat", "Sharing answers"),
    (r"\bcheating\b", 6, "cheat", "Mention of cheating"),
    (r"\b(copy|spread)\s+(me\s+)?(the\s+)?(answer|solution|paper|key)\b", 6, "cheat", "Copying/cheating"),
    (r"\b(private|secret)\s*(group|channel)\b", 5, "shady", "Secret group mention"),
    # PDF / file sharing
    (r"\bpdf\s*(file)?\b", 5, "shady", "PDF mention"),
    (r"\bdrive\s*link\b", 5, "shady", "Drive link mention"),
    (r"\b(mega|wetransfer|mediafire|zippyshare)\b", 6, "shady", "Known file sharing site"),
    # Exam terms that matter with suspicious context
    (r"\b(neet|jee|upsc|gate)\s*202[4-9]\b", 4, "general", "Exam year mention"),
    (r"\banswer\s*key\b", 5, "cheat", "Answer key"),
]

# Fuzzily common typos/misspellings for high-value terms
FUZZY_KEYWORDS = [
    ("leaked", ["leaked?", "leak?", "laked", "leeeeaked"]),
    ("answer", ["anser", "asnwer", "anwser"]),
    ("paper", ["papaer", "ppr", "papi"]),
    ("cheating", ["cheeting", "cheatin", "chitting"]),
]

# Suspicious URL categories
SUSPICIOUS_DOMAINS = {
    "file-sharing": {"drive.google.com", "mega.nz", "wetransfer.com", "mediafire.com",
                   "zippyshare.com", "file.io", "filebin.net", "anonfiles.com"},
    "paste-site": {"pastebin.com", "ghostbin.com", "hastebin.com", "termbin.com",
                   "0bin.net", "privatebin.info", "bin.hsnlists.com"},
    "telegram": {"t.me", "telegram.me"},
    "shortener": {"bit.ly", "tinyurl.com", "t.ly", "short.link", "cutt.ly",
                  "rb.gy", "is.gd", "goo.gl", "ow.ly"},
}

URL_REGEX = re.compile(
    r"(https?://|www\.|t\.me/|bit\.ly/|tinyurl\.com/)[a-zA-Z0-9_\-\.\?\=\&\%/]{3,}",
    re.IGNORECASE,
)


def scan_text(text: str | None) -> dict[str, Any]:
    """Scan message text for leaked content indicators."""
    if not text:
        return {"score": 0, "matches": [], "categories": [], "urls": []}

    lower = text.lower()
    matches: list[dict[str, Any]] = []
    seen = set()

    # 1. Keyword scanning with regex
    for pattern, weight, category, description in KEYWORD_PATTERNS:
        for match in re.finditer(pattern, lower, re.IGNORECASE):
            keyword = match.group(0)
            if keyword not in seen:
                seen.add(keyword)
                matches.append({
                    "type": "keyword",
                    "text": match.group(0),
                    "weight": weight,
                    "category": category,
                    "description": description,
                    "position": match.start(),
                })

    # 2. Fuzzy keyword catching (misspellings) — word-boundary only
    for canonical, variants in FUZZY_KEYWORDS:
        for variant in variants:
            pattern = rf"\b{re.escape(variant)}\b"
            for match in re.finditer(pattern, lower):
                key = f"fuzzy:{canonical}:{match.start()}"
                if key not in seen:
                    seen.add(key)
                    matches.append({
                        "type": "fuzzy",
                        "text": match.group(0),
                        "canonical": canonical,
                        "weight": 5,
                        "category": "general",
                        "description": f"Misspelled variant of '{canonical}'",
                        "position": match.start(),
                    })

    # 3. URL extraction and categorization
    urls = extract_urls(text)
    for url in urls:
        matches.append({
            "type": "url",
            "text": url["url"],
            "weight": url["weight"],
            "category": "shady" if url["weight"] > 3 else "general",
            "description": f"{url['category']} URL",
            "position": text.index(url["url"]) if url["url"] in text else 0,
        })

    # 4. Score calculation
    score = calculate_score(matches)
    categories = {m["category"] for m in matches}

    return {
        "score": score,
        "max_score": 50,
        "matches": matches,
        "categories": list(categories),
        "urls": urls,
    }


def extract_urls(text: str) -> list[dict[str, Any]]:
    """Extract and categorize URLs from text."""
    found: list[dict[str, Any]] = []
    seen = set()

    for match in URL_REGEX.finditer(text):
        url = match.group(0)
        if url in seen:
            continue
        seen.add(url)

        # Categorize
        category = "unknown"
        weight = 2  # Base weight for any URL
        domain = _extract_domain(url)

        for cat, domains in SUSPICIOUS_DOMAINS.items():
            if domain in domains or any(d in url.lower() for d in domains):
                category = cat
                weight = 5 if cat == "shortener" else (
                    7 if cat == "telegram" else 8
                )
                break

        found.append({
            "url": url,
            "domain": domain,
            "category": category,
            "weight": weight,
        })

    return found


def calculate_score(matches: list[dict[str, Any]]) -> float:
    """Calculate a risk score from 0-50 based on unique weighted signals."""
    if not matches:
        return 0.0

    # Use the strongest signal per category so benign overlap cannot inflate every message.
    category_best: dict[str, int] = {}
    uncategorized = 0
    for match in matches:
        weight = int(match.get("weight") or 0)
        category = str(match.get("category") or "")
        if category:
            category_best[category] = max(category_best.get(category, 0), weight)
        else:
            uncategorized += weight

    total = sum(category_best.values()) + uncategorized
    if total > 30:
        total = 30 + (total - 30) * 0.3

    return round(min(50, total), 1)


def _extract_domain(url: str) -> str:
    """Extract domain from URL string."""
    cleaned = url.lower().strip()
    if cleaned.startswith("http://"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("https://"):
        cleaned = cleaned[8:]
    if cleaned.startswith("www."):
        cleaned = cleaned[4:]
    return cleaned.split("/")[0].split(":")[0]


def is_suspicious(scan_result: dict[str, Any], threshold: float | None = None) -> bool:
    """Determine if a scan result is suspicious enough to flag."""
    limit = _detect_threshold() if threshold is None else threshold
    return scan_result["score"] >= limit


def get_alert_severity(scan_result: dict[str, Any]) -> str:
    """Get severity level from scan score."""
    score = scan_result["score"]
    critical, high, medium = _severity_thresholds()
    if score >= critical:
        return "critical"
    if score >= high:
        return "high"
    if score >= medium:
        return "medium"
    return "low"
