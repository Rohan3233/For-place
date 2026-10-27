"""Sanitize image URLs extracted from web scrapes or OCR text.

OCR and scraped HTML routinely mangle image URLs: "?" and "&" collapse
into "$=", query parameters weld into a single token, and stray spaces or
percent artifacts leak in. This module rebuilds a clean, display-ready URL
from that noise using `urllib.parse` plus a few targeted regex fixes.

Run the bundled test cases with:

    python qa/url_sanitizer.py
"""

from __future__ import annotations

import re
from urllib.parse import urlparse, urlunparse

# "$=" is the classic OCR collapse of both "?" (query marker) and "&"
# (separator). First occurrence becomes "?", the rest become "&".
_OCR_QUERY_MARK = re.compile(r"\$=")

# A real parameter key: starts with a letter/underscore, then letters,
# digits, dots, dashes or underscores. Digits-leading "keys" are bare
# values welded on by a mangled separator (see sanitize_image_url).
_VALID_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]*$")

# Leading digits are a bare-value artifact ("38408q=75" from "3840&q=75").
_LEADING_DIGITS = re.compile(r"^[0-9]+")

# Unencoded whitespace -> %20, but never double-encode an existing "%20".
_UNENCODED_SPACE = re.compile(r"(?<!\%)[\s]+")


def _fix_ocr_query_marks(url: str) -> str:
    """Turn OCR'd "$=" back into a real query marker / separators.

    If the URL has no genuine "?", the first "$=" is promoted to "?" and
    every later "$=" to "&". If a real "?" already exists, all "$=" are
    separators ("&").
    """
    has_real_query = "?" in url
    count = 0

    def _repl(_match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        if not has_real_query and count == 1:
            return "?"
        return "&"

    return _OCR_QUERY_MARK.sub(_repl, url)


def _clean_separator_artifacts(url: str) -> str:
    """Collapse duplicate separators and encode stray whitespace."""
    url = re.sub(r"\?&+", "?", url)   # "?&", "?&&", ...
    url = re.sub(r"&{2,}", "&", url)  # "&&", ...
    url = re.sub(r"&$", "", url)      # trailing "&"
    url = _UNENCODED_SPACE.sub("%20", url)
    return url


def sanitize_image_url(raw: str) -> str:
    """Return a clean, valid URL for an image from a scrape/OCR string.

    Steps:
      1. Fix OCR query-string noise ("$=" -> "?"/"&", stray whitespace).
      2. Strip query tokens that are not valid ``key=value`` pairs and any
         malformed/trailing artifacts (bare values, digit-leading "keys").
      3. Rebuild the URL with ``urllib.parse`` so the result is a single,
         display-ready string safe for a markdown/HTML audit table.
    """
    if not raw:
        return raw

    url = _fix_ocr_query_marks(raw.strip())
    url = _clean_separator_artifacts(url)

    parts = urlparse(url)

    kept: list[str] = []
    for token in parts.query.split("&"):
        token = token.strip()
        if not token:
            continue  # empty token (trailing/double separator)
        if "=" not in token:
            continue  # bare artifact ("%21", "3840", ...) — not key=value
        key, value = token.split("=", 1)

        # A mangled separator can weld a bare value onto the next real
        # parameter ("38408q=75" from "3840&q=75"). A parameter key cannot
        # start with a digit, so split the leading digits off as an
        # artifact and re-check the remainder.
        key = _LEADING_DIGITS.sub("", key)
        if not key or not _VALID_KEY.match(key):
            continue  # malformed key — drop the whole token
        kept.append(f"{key}={value}")

    query = "&".join(kept)
    rebuilt = urlunparse(
        (parts.scheme, parts.netloc, parts.path, parts.params, query, parts.fragment)
    )
    if rebuilt.endswith("?"):
        rebuilt = rebuilt[:-1]  # drop an empty query marker
    return rebuilt


def _run_tests() -> None:
    cases = [
        # The two garbled examples from the request.
        ("https://example.com/image.jpg$=38408q=75", "https://example.com/image.jpg?q=75"),
        ("https://example.com/banner.png$= %21", "https://example.com/banner.png"),
        # Already-clean URLs pass through untouched.
        ("https://example.com/photo.jpg?w=3840&q=75", "https://example.com/photo.jpg?w=3840&q=75"),
        # Repeated "$=" -> one "?" then "&" separators.
        ("https://example.com/a.png$=w=640$=q=50", "https://example.com/a.png?w=640&q=50"),
        # Next.js-style proxy URL with OCR'd separators (real-world case).
        (
            "https://example.com/_next/image$=url=%2Fimages%2Fhero.webp$=w=3840$=q=75",
            "https://example.com/_next/image?url=%2Fimages%2Fhero.webp&w=3840&q=75",
        ),
        # Trailing separator artifact.
        ("https://example.com/b.png?w=100&", "https://example.com/b.png?w=100"),
        # Bare "?" with no real parameters.
        ("https://example.com/c.png?", "https://example.com/c.png"),
        # Unencoded space in a value gets encoded for display.
        ("https://example.com/d.png?title=my photo", "https://example.com/d.png?title=my%20photo"),
        # Empty input passes through.
        ("", ""),
    ]

    failures = 0
    for raw, expected in cases:
        got = sanitize_image_url(raw)
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}  {raw!r} -> {got!r}" + ("" if ok else f"  (expected {expected!r})"))
        failures += 0 if ok else 1

    if failures:
        raise SystemExit(f"{failures} test case(s) failed")
    print(f"\nAll {len(cases)} test cases passed.")


if __name__ == "__main__":
    _run_tests()
