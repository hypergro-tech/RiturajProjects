#!/usr/bin/env python3
"""Fill images/<slug>/ with Pinterest search results for each theme in themes.json.

Runs a visible Chromium with its own persistent profile (.browser-profile/), so
you log in to Pinterest once and the session is reused on later runs.

  pip install playwright && playwright install chromium
  python3 scrape_pinterest.py --login          # log in once, then close the window
  python3 scrape_pinterest.py --only 05_japandi
  python3 scrape_pinterest.py                  # all themes, 100 each
  python3 scrape_pinterest.py --review         # rebuild review.html only

Re-running tops up folders that are short and never repeats an image.
"""
import argparse
import csv
import hashlib
import json
import random
import re
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
PROFILE = ROOT / ".browser-profile"
MANIFEST = ROOT / "manifest.csv"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
# i.pinimg.com/<236x|474x|736x|originals>/ab/cd/ef/<hash>.<ext> (skips 75x75_RS avatars)
PIN_IMG = re.compile(r"https://i\.pinimg\.com/(?:\d+x|originals)/([0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]+)\.(jpg|jpeg|png|webp)")
EXTS = ("jpg", "jpeg", "png", "webp")


def collect_urls(page, query, want, max_scrolls=60):
    """Scroll a Pinterest search until `want` unique image keys are seen."""
    page.goto("https://www.pinterest.com/search/pins/?q=" + urllib.request.quote(query) + "&rs=typed")
    page.wait_for_timeout(3000)
    found, stale = {}, 0
    for _ in range(max_scrolls):
        srcs = page.eval_on_selector_all(
            'img[src*="i.pinimg.com"]',
            "els => els.map(e => (e.getAttribute('srcset') || '') + ' ' + e.src)")
        before = len(found)
        for s in srcs:
            for key, ext in PIN_IMG.findall(s):
                found.setdefault(key, ext)
        if len(found) >= want:
            break
        stale = stale + 1 if len(found) == before else 0
        if stale >= 5:  # results ran out
            break
        page.mouse.wheel(0, 2500)
        page.wait_for_timeout(random.randint(1200, 2200))
    return list(found.items())


def fetch(key, ext):
    """Download the largest available rendition; return (bytes, url, ext) or None."""
    for size in ("originals", "736x"):
        for e in dict.fromkeys([ext, *EXTS]):
            url = f"https://i.pinimg.com/{size}/{key}.{e}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.pinterest.com/"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
            except Exception:
                continue
            return data, url, e
    return None


def build_review(themes):
    """One HTML page with a thumbnail grid per theme, for manual curation."""
    parts = ["<!doctype html><meta charset=utf-8><title>Bedroom dataset review</title>",
             "<style>body{font:14px sans-serif;margin:16px}h2{margin-top:32px}"
             ".g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px}"
             ".g a{display:block}.g img{width:100%;height:120px;object-fit:cover}"
             ".g span{font-size:11px;color:#666}</style>"]
    for t in themes:
        files = sorted(p for p in (ROOT / "images" / t["slug"]).iterdir() if p.suffix[1:] in EXTS)
        parts.append(f"<h2>{t['name']} — {len(files)}</h2><div class=g>")
        for p in files:
            rel = p.relative_to(ROOT).as_posix()
            parts.append(f"<a href='{rel}' target=_blank><img loading=lazy src='{rel}'><span>{p.name}</span></a>")
        parts.append("</div>")
    (ROOT / "review.html").write_text("\n".join(parts))
    print("wrote review.html")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-theme", type=int, default=100)
    ap.add_argument("--only", nargs="*", help="theme slugs to run")
    ap.add_argument("--login", action="store_true", help="open Pinterest to log in, then exit")
    ap.add_argument("--review", action="store_true", help="only rebuild review.html")
    args = ap.parse_args()

    themes = json.loads((ROOT / "themes.json").read_text())
    if args.only:
        themes = [t for t in themes if t["slug"] in args.only]
    if args.review:
        return build_review(themes)

    # Hashes of every image already on disk, across all themes, so nothing repeats.
    seen = {hashlib.md5(p.read_bytes()).hexdigest()
            for p in (ROOT / "images").rglob("*") if p.suffix[1:] in EXTS}
    new_manifest = not MANIFEST.exists()

    with sync_playwright() as pw, MANIFEST.open("a", newline="") as mf:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=False, viewport={"width": 1400, "height": 1000})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if args.login:
            page.goto("https://www.pinterest.com/login/")
            input("Log in to Pinterest in the browser window, then press Enter here... ")
            ctx.close()
            return

        w = csv.writer(mf)
        if new_manifest:
            w.writerow(["theme", "file", "source_url", "query"])
        for t in themes:
            out = ROOT / "images" / t["slug"]
            out.mkdir(parents=True, exist_ok=True)
            have = [p for p in out.iterdir() if p.suffix[1:] in EXTS]
            need = args.per_theme - len(have)
            if need <= 0:
                print(f"{t['slug']}: complete")
                continue
            # Over-collect: some pins are duplicates, tiny, or fail to download.
            candidates = collect_urls(page, t["query"], need * 2 + len(have))
            print(f"{t['slug']}: have {len(have)}, need {need}, {len(candidates)} candidates")
            n = len(have)
            for key, ext in candidates:
                if need <= 0:
                    break
                got = fetch(key, ext)
                if not got:
                    continue
                data, url, e = got
                h = hashlib.md5(data).hexdigest()
                if h in seen:
                    continue
                seen.add(h)
                n += 1
                dest = out / f"{t['slug']}_{n:03d}.{e}"
                dest.write_bytes(data)
                w.writerow([t["slug"], dest.relative_to(ROOT).as_posix(), url, t["query"]])
                mf.flush()
                need -= 1
                time.sleep(random.uniform(0.2, 0.6))
            print(f"  -> {n} images" + (f" ({need} short; rerun or tweak the query)" if need > 0 else ""))
        ctx.close()
    build_review(json.loads((ROOT / "themes.json").read_text()))


if __name__ == "__main__":
    main()
