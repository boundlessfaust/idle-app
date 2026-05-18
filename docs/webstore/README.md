# Web Store Assets

Source files for the Chrome Web Store listing. All SVGs must be exported to PNG before upload.

## Required upload formats

| Asset | Dimensions | Source file | Notes |
|---|---|---|---|
| Store icon | 128×128 PNG | `../../apps/browser-extension/public/icon/128.png` | Already exists |
| Screenshot 1–5 | 1280×800 PNG | `screenshot-1.svg` … `screenshot-5.svg` | At least 1 required, 5 recommended |
| Small promo tile | 440×280 PNG | `promo-tile.svg` | Appears in search results |
| Marquee image | 1400×560 PNG | `marquee.svg` | Rotating carousel (optional but recommended) |

## Exporting SVG → PNG

Open each SVG in Chrome and use DevTools to capture at exact resolution:

```bash
# One-liner using Chrome headless (requires Chrome/Chromium in PATH)
# Adjust --window-size to match each file's dimensions

# Screenshots (1280×800)
for i in 1 2 3 4 5; do
  chromium --headless --screenshot="screenshot-${i}.png" \
    --window-size=1280,800 "screenshot-${i}.svg"
done

# Promo tile (440×280)
chromium --headless --screenshot="promo-tile.png" \
  --window-size=440,280 "promo-tile.svg"

# Marquee (1400×560)
chromium --headless --screenshot="marquee.png" \
  --window-size=1400,560 "marquee.svg"
```

Or open each SVG in a browser, set zoom to 100%, and use a full-page screenshot tool.

## Screenshot content

| File | Scene | Activity shown |
|---|---|---|
| `screenshot-1.svg` | Claude.ai chat, light mode | Physical Reset — "Look 20 feet away" |
| `screenshot-2.svg` | Claude.ai chat, Write Only panel | Write Only — "Draft your next instruction" |
| `screenshot-3.svg` | Popup (quick controls) | N/A — shows enable/mute/detection controls |
| `screenshot-4.svg` | Options / Settings page | N/A — shows all configurable settings |
| `screenshot-5.svg` | Dark mode chat | Diffuse — "Close your eyes" |

## Text copy

See `store-listing.md` for the full title, summary, and description to paste into the Developer Dashboard.
