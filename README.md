# CalmNotes

**Just you, your thoughts. Nothing in between.**

A calm, distraction-free notepad that lives in your browser. Open it and write.

- One page. Nothing else on screen, and the little controls fade while you type.
- Saves as you type, in your own browser. There is no account and no server, and nothing you write leaves your device.
- Google Docs–style lists: type `1. ` or `- `, press **Enter** to continue, **Tab** to nest (1 → a → i), **Shift+Tab** to un-nest, **Enter** on an empty item to step out.
- `clear` (top-left, tap twice) starts a blank page, and **Ctrl/⌘+Z** brings it back.
- `···` menu: word count, copy all, download as `.txt`, install as an app.
- Installable and works offline.

## Run it locally

No build step. Serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy

It's plain static files, so any static host works. On Vercel: import the repo, leave the framework as **Other** with no build command, and deploy. `vercel.json` sets caching and security headers.

After the first deploy, put your real domain into the `og:image` and `twitter:image` tags in `index.html` (already set to `https://calmnotes.vercel.app/og.png`). Some link previews (WhatsApp, X) need the full URL.

## Shipping an update

Bump `VERSION` in `sw.js` (for example `calmnotes-v2`) whenever you change files, so people who already opened the app get the new version.

## Project layout

```
index.html              the page
css/style.css           all styles
js/app.js               editor, lists, saving, menu
sw.js                   offline support
manifest.webmanifest    install-as-app details
fonts/                  Roboto Mono, self-hosted (Apache 2.0)
icons/, og.png          app icons and link preview image
```
