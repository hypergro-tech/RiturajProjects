# Wishly TikTok: "Lena" (memories → lyrics)

`wishly-tiktok-lena.mp4` · 1080×1920 · 31 s · 30 fps · with audio

The soundtrack is the real site sample **"Five minutes late, right on time" (For Lena · Birthday · Disco-pop)**. Every cut and caption is timed to its lyrics, so each memory pops up as a detail just as it's sung.

| Time | Lyric (from the sample) | On screen |
|---|---|---|
| 0–1.6 | (intro) | Hook: "this song was made for exactly one person" · sound on |
| 1.6–4.6 | "Lena's five minutes late," | Lena dancing · ✓ her name · ✓ always 5 minutes late |
| 4.6–7.9 | "with the snacks in her hand," | Snacks + cake · ✓ the emergency snacks |
| 7.9–12.3 | "turns the kitchen to a dance floor, like nobody else can" | Kitchen dance · ✓ the kitchen dancing |
| 12.3–13.3 | (gap) | Her best friend: "every line came from her best friend's memories" |
| 13.3–18.4 | "Thirty looks like laughing with your favorite people near" | Her friends · ✓ turning 30 · ✓ her favorite people |
| 18.4–20.2 | (sustain) | "she shared the story. Wishly made the song." + the brief she filled in |
| 20.2–24.7 | "Lena, light the room again, this is your year" | Lena laughing, close-up |
| 24.7–31 | (song fades) | End card: A song made *just for them.* · Make one for your person |

## Before publishing
- The sample audio README says these samples were AI-generated for design review and **must pass human review** (pronunciation, quality, resemblance) before they're approved for launch.
- The photos are the website's own AI-generated images. The kitchen-dancing photo is the Lena used throughout; the party shot only shows her friends.
- Captions sit outside TikTok's bottom and right UI zones. Upload with the embedded audio (don't swap in a trending sound, because the lyric is the proof).

## Re-render
```bash
PW=$(npm root -g)/playwright node scripts/render.mjs video wishly-tiktok-lena.mp4 30
```
Shot framing is in `SHOTS`, lyric timings in `LINES`, and detail chips in `CHIPS` (all in `index.html`).
