# Chrome Web Store listing — Sanskrit Sandhi Search

Copy/paste these into the Developer Dashboard fields. Screenshots and the privacy
policy URL are the only things you must supply yourself (see checklist at bottom).

---

## Product name
Sanskrit Sandhi Search

## Summary (short description, ≤132 chars)
Sandhi-tolerant find-on-page for Devanāgarī: type a citation-form query (ITRANS or देवनागरी) to highlight sandhi-fused matches.

## Category
Productivity   (alternative: Tools)

## Language
English

## Detailed description
A sandhi-tolerant “find on page” for Sanskrit / Devanāgarī.

Type a phrase in its citation (pausā) form — in ITRANS or in Devanāgarī — and the
extension highlights where it actually occurs in the running text, including the
sandhi-fused forms that the browser’s own Ctrl-F and most site searches miss.

Examples:
• buddheḥ jāyamānāḥ  →  finds  बुद्धेर्जायमानाः
• samyak jñānam       →  finds  सम्यग्ज्ञान
• tataH ca            →  finds  ततश्च

Highlights:
• Sandhi-aware, high-recall matching (visarga, vowel sandhi, mātrā fusion, and more).
• Type in ITRANS (e.g. buddheH jAyamAnAH) or paste Devanāgarī directly.
• Orthography- and space-tolerant: canonicalizes both your query and the page text
  so equivalent spellings match.
• In-place highlighting with next/previous navigation and a match counter.
• Three modes: sandhi (default, high recall) · loose (space-insensitive) · exact.

Privacy: 100% local. No network calls, no accounts, no tracking, no data leaves
your browser.

How to use:
• Click the toolbar icon, or press Ctrl+Shift+S (⌘+Shift+S on Mac), to toggle the bar.
• Enter = next match, Shift+Enter = previous, Esc = close.
• Rebind the shortcut at chrome://extensions/shortcuts if it conflicts.

Note (v1): matches are found within a single block element and on the current page.

## Single purpose (required field)
A single-purpose tool that provides sandhi-tolerant search-and-highlight of
Devanāgarī (Sanskrit) text on the page the user is currently viewing.

## Permission justifications (required for review)

Host permission — `<all_urls>` / “Read and change all your data on websites”:
> The extension’s single feature is an on-page find for Devanāgarī text. To find
> and highlight matches it must read the visible text of, and insert highlight
> markup into, the page the user is currently viewing. Sanskrit texts are hosted
> across many different websites, so the user must be able to run the search on
> any page they open. All reading and highlighting happens locally in the browser;
> no page content or query is transmitted or stored.

Remote code: None. All code is contained in the extension package.

Data collection: None. The extension collects no user data.

---

## Pre-submit checklist (things only you can do)
1. Host the privacy policy (store/PRIVACY.md) at a public URL and paste that URL
   into the dashboard. Easiest: create a public GitHub Gist of PRIVACY.md, or a
   GitHub Pages page, or a “Publish to web” Google Doc. Replace <YOUR-EMAIL-HERE>
   in the policy first.
2. Capture 1–5 screenshots at 1280×800 (or 640×400): load the extension, open a
   Sanskrit page (e.g. a stotranidhi.com or upasanayoga.org page), run a search,
   and screenshot the highlighted result with the bar visible.
3. (Optional) A 440×280 small promo tile helps the listing look complete.
4. In “Privacy practices”: declare NO data collection and check the compliance box.
5. Set visibility (Public / Unlisted) and Submit for review.
