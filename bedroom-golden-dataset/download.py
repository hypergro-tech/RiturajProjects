#!/usr/bin/env python3
"""Build the bedroom golden dataset from Shutterstock via the official API.

Searches each theme in themes.json, then licenses and downloads the top N
images into images/<slug>/. Licensing uses your subscription's downloads, so
run --dry-run first to review what would be licensed.

  export SHUTTERSTOCK_TOKEN=...      # OAuth token with licenses.create scope
  export SHUTTERSTOCK_SUBSCRIPTION=... # subscription id (GET /v2/user/subscriptions)
  python3 download.py --dry-run
  python3 download.py --per-theme 100
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.shutterstock.com/v2"
ROOT = Path(__file__).parent


def call(method, path, token, params=None, body=None):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")
    sys.exit(f"{method} {path} failed after retries")


def search(token, query, count):
    """Return up to `count` photo ids, skipping duplicates across pages."""
    ids, page = [], 1
    while len(ids) < count:
        res = call("GET", "/images/search", token, {
            "query": query, "image_type": "photo", "orientation": "horizontal",
            "sort": "relevance", "per_page": 100, "page": page, "view": "minimal",
        })
        batch = [d["id"] for d in res.get("data", [])]
        if not batch:
            break
        ids += [i for i in batch if i not in ids]
        page += 1
    return ids[:count]


def license_and_download(token, sub, image_id, dest, size):
    res = call("POST", "/images/licenses", token, {"subscription_id": sub}, {
        "images": [{"image_id": image_id, "size": size}],
    })
    item = res["data"][0]
    if item.get("error"):
        raise RuntimeError(item["error"])
    urllib.request.urlretrieve(item["download"]["url"], dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-theme", type=int, default=100)
    ap.add_argument("--size", default="huge", choices=["small", "medium", "huge"])
    ap.add_argument("--only", nargs="*", help="theme slugs to run")
    ap.add_argument("--dry-run", action="store_true", help="search only, no licensing")
    args = ap.parse_args()

    token = os.environ.get("SHUTTERSTOCK_TOKEN") or sys.exit("SHUTTERSTOCK_TOKEN not set")
    sub = os.environ.get("SHUTTERSTOCK_SUBSCRIPTION")
    if not args.dry_run and not sub:
        sys.exit("SHUTTERSTOCK_SUBSCRIPTION not set")

    themes = json.loads((ROOT / "themes.json").read_text())
    if args.only:
        themes = [t for t in themes if t["slug"] in args.only]

    seen = set()  # keep an image in at most one theme
    manifest = ROOT / "manifest.csv"
    new = not manifest.exists()
    with manifest.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["theme", "image_id", "file", "query"])
        for t in themes:
            out = ROOT / "images" / t["slug"]
            out.mkdir(parents=True, exist_ok=True)
            have = {p.stem for p in out.glob("*.jpg")}
            seen |= have
            need = args.per_theme - len(have)
            if need <= 0:
                print(f"{t['slug']}: complete")
                continue
            ids = [i for i in search(token, t["query"], args.per_theme * 2) if i not in seen][:need]
            print(f"{t['slug']}: {len(have)} present, {len(ids)} to fetch")
            if args.dry_run:
                continue
            for i in ids:
                dest = out / f"{i}.jpg"
                try:
                    license_and_download(token, sub, i, dest, args.size)
                except Exception as e:  # keep going; rerun fills gaps
                    print(f"  {i}: {e}")
                    continue
                seen.add(i)
                w.writerow([t["slug"], i, dest.relative_to(ROOT), t["query"]])
                f.flush()


if __name__ == "__main__":
    main()
