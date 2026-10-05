# Bedroom Golden Dataset

28 bedroom interior themes × 100 images, sourced from Shutterstock.

- `themes.json` — theme name, folder slug and the search query used
- `images/<NN_slug>/` — one folder per theme (filled by `download.py`)
- `download.py` — searches, licenses and downloads via the official Shutterstock API
- `manifest.csv` — written by the script: theme, image id, file, query

## Run

1. Create an API app at https://www.shutterstock.com/account/developers/apps and generate
   an OAuth token with the `licenses.create` scope.
2. Find your subscription id: `curl -H "Authorization: Bearer $SHUTTERSTOCK_TOKEN" https://api.shutterstock.com/v2/user/subscriptions`
3. ```
   export SHUTTERSTOCK_TOKEN=... SHUTTERSTOCK_SUBSCRIPTION=...
   python3 download.py --dry-run          # search only, nothing licensed
   python3 download.py --only 05_japandi  # try one theme
   python3 download.py                    # all themes, 100 each
   ```

Licensing all 2,800 images uses 2,800 downloads from your plan. The script can be re-run
safely: it skips images already present and never puts one image in two themes.
Tweak a theme's `query` in `themes.json` if its results drift off-style.
Images are licensed assets — keep them out of git (see `.gitignore`).
