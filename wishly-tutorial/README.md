# Wishly tutorial: "How to gift a song about them"

`wishly-tutorial.mp4` · 1080×1920 · 49 s · voiceover, captions, music bed and real sample audio

A step-by-step tutorial recorded from the **real Wishly website** on a phone-sized screen. Lena's details are typed into each step, and the camera zooms into each field as it's filled.

| Time | Step | What happens |
|---|---|---|
| 0–3.4 | Hook | "How to gift a song *about them*" over the homepage |
| 3.4–9.8 | Hear a real sample | Tap play on *For Lena · Birthday* and hear "Lena's five minutes late" |
| 9.8–15.6 | 1 · Who's it for? | Name **Lena**, pronunciation **LEH-nah**, from **Priya** |
| 15.6–22.6 | 2 · Share the story | Memory typed word by word, then the permission tick |
| 22.6–27.0 | 3 · Pick the sound | Joyful pop selected, then scroll to language |
| 27.0–32.6 | 4 · Choose how to give it | Personal song selected; extras shown as optional |
| 32.6–35.6 | Review | Check names, pronunciation, story, then checkout |
| 35.6–38.0 | My Songs | Production progress screen |
| 38.0–45.0 | Share & listen | Gift link copied, then Lena hears "Lena, light the room again, this is *your year*" |
| 45.0–49.0 | End card | A song made *just for them.* · Create their song |

## What was changed from the prototype
- Hidden: the "Design review prototype" bar, the cookie popup, and the "example" labels on the production-progress screen.
- The **"Ready to listen / Share gift link" screen (38–40s) is a mock-up in the brand style**, because the prototype's share and download screens only show placeholder states.
- The music bed is synthesised. The two song clips are the site's Lena sample, which its README says still needs human review before launch.

## Rebuild
```bash
SITE=/path/to/wishly/index.html PW=$(npm root -g)/playwright node scripts/capture.mjs   # re-capture screens
python3 - <<'EOF'   # regenerate data.js from screens/states.json + audio/vo.tsv (see commit history)
EOF
python3 scripts/bed.py audio/bed.wav 49                                                     # music bed
PW=$(npm root -g)/playwright node scripts/render.mjs video wishly-tutorial.mp4 30
```
Voiceover lines are in `audio/vo.tsv` (generated with edge-tts, voice en-US-AvaNeural). Timings, scroll, zoom and tap points are in `index.html` (`SEG`, `SCHED`, `SCROLL`, `CAM`, `TAPS`).
