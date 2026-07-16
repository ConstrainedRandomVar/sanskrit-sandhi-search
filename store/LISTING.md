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

activeTab:
> The extension’s single feature is an on-page find for Devanāgarī text. When the
> user invokes it (toolbar click or keyboard shortcut), it needs temporary access
> to the current tab to read the visible text and insert highlight markup. Access
> is granted only on that explicit invocation, only for that tab, and only until
> the user navigates to another site. Nothing is transmitted or stored.

scripting:
> Used to inject the search UI and matching engine into the current tab at the
> moment the user invokes the extension (paired with activeTab). No scripts run on
> any page until the user asks.

Remote code: None. All code is contained in the extension package.

Data collection: None. The extension collects no user data.

---

## Pre-submit checklist (things only you can do)
1. Privacy policy is already hosted — paste this URL into the dashboard:
   https://github.com/ConstrainedRandomVar/sanskrit-sandhi-search/blob/main/store/PRIVACY.md
   (With activeTab a privacy policy may not even be required, but it's ready either way.)
2. Screenshots (1280×800) are prepared in screenshots/store-ready/. Optional:
   recapture with a taller browser window for a fuller, less letterboxed image.
3. (Optional) A 440×280 small promo tile helps the listing look complete.
4. In “Privacy practices”: declare NO data collection and check the compliance box.
5. Set visibility (Public / Unlisted) and Submit for review.
