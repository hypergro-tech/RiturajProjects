# Bedroom Golden Dataset

28 bedroom interior themes × 100 images, collected from Pinterest search on your own machine.

- `themes.json` — theme name, folder slug and the Pinterest search query
- `images/<NN_slug>/` — one folder per theme
- `scrape_pinterest.py` — drives a visible Chromium through Pinterest and fills the folders
- `manifest.csv` — written as it runs: theme, file, source image URL, query
- `review.html` — thumbnail grid of every folder, rebuilt at the end of each run

## Setup (once)

```
pip install playwright
playwright install chromium
python3 scrape_pinterest.py --login   # log in to Pinterest in the window, press Enter
```

The login is saved in `.browser-profile/` (git-ignored), so later runs stay signed in.

## Run

```
python3 scrape_pinterest.py --only 05_japandi   # try one theme first
python3 scrape_pinterest.py                     # all 28 themes, 100 each
```

Keep the browser window open while it runs; a full run takes roughly 1–2 hours.
It downloads the original-resolution file for each pin (736px fallback), skips exact
duplicates across all themes, and names files `<slug>_001.jpg`, `<slug>_002.jpg`, …

## Curate

Open `review.html`, delete any off-style or non-bedroom images from the folders, then
re-run the script: it tops each folder back up to 100 without re-adding anything it
already has. If a theme keeps drifting, sharpen its `query` in `themes.json`.
`python3 scrape_pinterest.py --review` rebuilds the review page without scraping.

Note: Pinterest images belong to their creators and Pinterest's terms prohibit automated
scraping — keep the dataset internal and the images out of git (see `.gitignore`).
