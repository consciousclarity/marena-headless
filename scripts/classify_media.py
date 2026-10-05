"""
Marena Bali — Media classifier.

Pulls all 100 media items from the staging WordPress REST API, scans
each villa / experience page for image references, and produces a
curated manifest grouped by target Strapi entry. Output is a JSON file
the human editor reviews before uploading to Strapi.

The script does NOT download the images. It just builds the index of
"image X is referenced N times on page Y" so the editor can pick the
right 6–10 photos per villa without eyeballing 100 thumbnails.

Usage:
    python scripts/classify_media.py
    # → writes ../media-manifest.json

Required env (already in .env):
    MARENABALI_WP_USER, MARENABALI_WP_APP_PASSWORD, MARENABALI_STAGING_WP_URL
"""
from __future__ import annotations
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

WP_USER = os.environ["MARENABALI_WP_USER"]
WP_PASS = os.environ["MARENABALI_WP_APP_PASSWORD"]
WP_URL = os.environ["MARENABALI_STAGING_WP_URL"].rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "media-manifest.json"


def get(path: str) -> list | dict:
    """Authenticated GET against WP REST API. Follows pagination."""
    url = f"{WP_URL}/wp-json/wp/v2/{path}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "marena-media-classifier/1.0",
        "Authorization": f"Basic {__import__('base64').b64encode(f'{WP_USER}:{WP_PASS}'.encode()).decode()}",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_all(path: str) -> list[dict]:
    """WP REST caps per_page at 100. Walk pages if needed."""
    out: list[dict] = []
    page = 1
    while True:
        chunk = get(f"{path}&per_page=100&page={page}" if "?" in path else f"{path}?per_page=100&page={page}")
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    return out


def main() -> int:
    print(f"[fetch] media library from {WP_URL} …")
    media = fetch_all("media")
    # Index by URL — the same physical image may appear in multiple sizes,
    # we just want the canonical full-size src.
    by_url: dict[str, dict] = {m["source_url"]: m for m in media if m.get("source_url")}
    print(f"[fetch] {len(media)} media items")

    print("[fetch] pages …")
    pages = fetch_all("pages")
    pages_by_slug = {p["slug"]: p for p in pages}

    # Slug → which Strapi target. Mirrors MIGRATION.md §4.
    VILLA_SLUGS = {"1-bedroom-villa": "villa:1br", "2-bedroom-villa": "villa:2br", "4-bedroom-villa": "villa:4br"}
    EXPERIENCE_SLUGS = {
        "marena-experience-bbq-and-groceries": "experience:bbq",
        "marena-experience-spa-wellness": "experience:spa",
        "marena-experience-flowers": "experience:flowers",
        "marena-experience-wine-champagne": "experience:wine",
        "marena-experience-spirits": "experience:spirits",
        "marena-experience-cakes": "experience:cakes",
        "beers-and-mix-softdrinks": "experience:beers",
        "marena-experience": "experience:hub",  # the parent intro
    }

    # For each page, extract all image URLs from the rendered content.
    img_re = re.compile(r"https?://[^\"')\s]+\.(?:jpe?g|png|webp|avif)", re.IGNORECASE)

    usage: dict[str, Counter] = defaultdict(Counter)
    for slug, target in {**VILLA_SLUGS, **EXPERIENCE_SLUGS}.items():
        page = pages_by_slug.get(slug)
        if not page:
            print(f"[warn] page not found: {slug}")
            continue
        content = page["content"]["rendered"]
        urls = set(img_re.findall(content))
        print(f"[scan] {slug:35} → {len(urls):3} unique image refs")
        for url in urls:
            # WP serves scaled variants (e.g. -150x150.jpg, -scaled.jpg).
            # Normalize by stripping WP's size suffix to match the canonical
            # source_url key in the media library.
            canonical = re.sub(r"-\d+x\d+(?=\.\w+$)", "", url)
            canonical = re.sub(r"-scaled(?=\.\w+$)", "", canonical)
            usage[target][canonical] += 1

    # Build the manifest. One section per target. Sorted by usage desc.
    manifest = {
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "source_site": WP_URL,
        "totals": {
            "media_items": len(media),
            "pages_scanned": sum(1 for s in {**VILLA_SLUGS, **EXPERIENCE_SLUGS} if s in pages_by_slug),
        },
        "targets": {},
        "unmatched": [],
    }

    used_urls: set[str] = set()
    for target, counts in usage.items():
        entries = []
        for url, n in counts.most_common():
            m = by_url.get(url) or by_url.get(re.sub(r"-\d+x\d+(?=\.\w+$)", "", url))
            if not m:
                continue
            entries.append({
                "id": m["id"],
                "title": m["title"]["rendered"],
                "url": m["source_url"],
                "width": m.get("media_details", {}).get("width"),
                "height": m.get("media_details", {}).get("height"),
                "ref_count": n,
            })
            used_urls.add(m["source_url"])
        manifest["targets"][target] = entries

    # Anything in the media library not referenced on a villa/experience
    # page — icons, logos, legacy admin stuff. Editor can still pick any.
    manifest["unmatched"] = [
        {"id": m["id"], "title": m["title"]["rendered"], "url": m["source_url"]}
        for m in media
        if m.get("source_url") and m["source_url"] not in used_urls
    ]

    OUT.write_text(json.dumps(manifest, indent=2))
    print(f"\n[ok] wrote {OUT}")
    print(f"[ok] {sum(len(v) for v in manifest['targets'].values())} images classified across {len(manifest['targets'])} targets")
    print(f"[ok] {len(manifest['unmatched'])} unmatched (icons, etc.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
