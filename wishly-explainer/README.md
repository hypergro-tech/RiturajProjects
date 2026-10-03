# Wishly: "How to create your first Wishly song"

Vertical 1080×1920 · 30 fps · 37.8 s · `wishly-how-to-create-your-first-song.mp4`

The video is animated UI built in `index.html` and rendered frame by frame. It has **no audio**: the on-screen text carries the message when muted, and the voiceover and music below are added in the edit.

## Timeline + voiceover (≈80 words, calm conversational pace)

| Time | Scene | On screen | Voiceover |
|---|---|---|---|
| 0.0–3.4 | Intro | "How to create your first *Wishly song.*" | "Here's how to make your first Wishly song." |
| 3.4–8.6 | 01 Tell us who it's for | Lena · Lenny · LEH-nah · Best friend · Birthday | "Start with them: their name, how to say it, and the moment." |
| 8.6–13.8 | 02 Share the story | "Dancing to ABBA in the kitchen at 2am…" · "One more song!" | "Add the little things only you know." |
| 13.8–18.8 | 03 Choose the sound | Disco-pop preview · Playful · English | "Pick a style, mood and language. Tap to hear samples." |
| 18.8–23.6 | 04 Pick how to give it | Personal song (the gift) + optional extras | "The song is the gift. Extras are optional." |
| 23.6–28.4 | 05 Review & order | Details checked · price, taxes & delivery shown before paying | "Check every detail before you pay." |
| 28.4–33.8 | 06 Listen & give | My Songs → Ready · lyrics with "Lenny", "ABBA", "One more song!" · Share gift link | "When it's ready, listen, download, or share a private gift link." |
| 33.8–37.8 | Outro | "A song made *just for them.*" · Create their song | "Wishly. A song made just for them." |

## Audio notes
- **Music:** play the real *For Lena · Birthday* (disco-pop) sample quietly underneath, and turn it up at 29.8–33.0 s so the lyric with her name is audible while the karaoke lines highlight.
- **Lyrics:** the lyric lines in step 6 are placeholders. Replace them with the real sample's lyrics in `index.html` (`#ly1`–`#ly4`) and re-render.
- Add a soft UI tap sound on each tap ring (the times are listed in the `picks` array in `index.html`).

## Re-render
```bash
PW=$(npm root -g)/playwright node scripts/render.mjs video wishly-how-to-create-your-first-song.mp4 30
PW=$(npm root -g)/playwright node scripts/render.mjs stills 5,12,20 ./stills   # spot-check frames
```
Edit names, copy, colours (CSS `:root`) or timings (`data-start`/`data-end` on each scene) in `index.html`.
