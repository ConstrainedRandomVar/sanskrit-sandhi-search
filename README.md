# Sanskrit Sandhi Search

A sandhi-tolerant **“find on page”** for Sanskrit / Devanāgarī, as a Chrome (MV3) extension.

Type a phrase in its citation (pausā) form — in **ITRANS** or **Devanāgarī** — and it
highlights where the phrase actually occurs in running text, including the **sandhi-fused**
forms that the browser’s own Ctrl-F and most site searches miss.

```
buddheḥ jāyamānāḥ   →  finds  बुद्धेर्जायमानाः
samyak jñānam        →  finds  सम्यग्ज्ञान
tataH ca             →  finds  ततश्च
```

**100% local.** No network calls, no accounts, no tracking — nothing leaves your browser.

## Install

- **Chrome Web Store:** _(link once published)_
- **From source (developer mode):**
  1. `chrome://extensions` → enable **Developer mode**
  2. **Load unpacked** → select this folder
  3. (Edge works too, at `edge://extensions`)

## Use

- Click the toolbar icon, or press **Ctrl+Shift+S** (**⌘+Shift+S** on Mac), to toggle the bar.
- Type a query (ITRANS like `buddheH jAyamAnAH`, or paste Devanāgarī).
- **Enter** = next match · **Shift+Enter** = previous · **Esc** = close.
- **Modes:** `sandhi` (default, high-recall) · `loose` (space-insensitive) · `exact`.
- Rebind the shortcut at `chrome://extensions/shortcuts` if it conflicts.

## How it works

`content.js` groups the page’s text by block element, runs the shared sandhi engine
(`sanskrit-search.js`) through `highlight-core.js` to locate match spans, and wraps them in
`<mark>` in place. The UI is a shadow-root bar so page styles can’t interfere. The engine
normalizes both the query and the page text to one canonical form, then expands the query
into the sandhi surface forms it could take, and matches those.

## Build the store package

```
./package.sh          # produces sanskrit-sandhi-search-<version>.zip for the Web Store
```

## Notes

- Matches are found **within a single block element** and on the **current page** (v1).
- `sanskrit-search.js` is the search engine. It is developed and tested in a separate
  project and vendored here so the extension ships self-contained.

## Privacy

See [`store/PRIVACY.md`](store/PRIVACY.md). Short version: the extension reads the current
page’s text locally to find and highlight matches, and transmits nothing.

## License

MIT — see [`LICENSE`](LICENSE).
