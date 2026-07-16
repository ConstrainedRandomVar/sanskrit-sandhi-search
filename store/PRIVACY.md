# Privacy Policy — Sanskrit Sandhi Search

_Last updated: 2026-07-16_

Sanskrit Sandhi Search is a browser extension that provides a sandhi-tolerant
"find on page" for Devanāgarī text. This policy explains, plainly, what it does
and does not do with your data.

## Summary

**The extension collects no data of any kind. Nothing is transmitted anywhere.**
All processing happens locally, inside your browser, on the page you are already
viewing.

## What the extension accesses

- When you open the search bar and type a query, the extension reads the **text
  content of the page you are currently viewing** in order to find and highlight
  matches. This reading happens entirely on your device.

## What the extension does NOT do

- It does **not** collect, store, or log your search queries.
- It does **not** collect, store, or transmit the content of the pages you visit.
- It does **not** make any network requests. It has no server and no backend.
- It does **not** use cookies, analytics, tracking, or advertising.
- It does **not** sell or share any data with third parties (it has none to share).
- It does **not** use remote code; all logic ships inside the extension package.

## Permissions

The extension uses two permissions. Both are scoped to the tab you are actively
using, and neither takes effect until you invoke the extension (by clicking its
toolbar icon or pressing its keyboard shortcut):

- **`activeTab`** — grants temporary access to the current tab, only on that
  invocation, so the extension can read the page's visible Devanāgarī text and draw
  highlight marks over matches. Access is limited to the active tab and is revoked
  when you navigate to another site.
- **`scripting`** — used, at the same moment of invocation, to inject the
  extension's own bundled search bar and matching engine into the current tab. Only
  code packaged inside the extension is injected; no remote or externally hosted
  code is ever loaded or executed.

The extension has no standing access to any website, does nothing until you invoke
it, and never transmits or stores your queries or page content.

## Contact

For questions about this policy, contact: hlakshmi@gmail.com

## Changes

If this policy ever changes, the updated version will be posted at this same URL
with a revised "Last updated" date.
