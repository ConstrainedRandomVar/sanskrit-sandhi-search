// Service worker. On toolbar click or keyboard shortcut, inject the engine + UI
// into the active tab (activeTab grants tab access on that invocation), then toggle
// the search bar. No standing host permissions; nothing runs on any page until the
// user explicitly invokes the extension.
async function toggleOnTab(tabId) {
  if (tabId == null) return;
  try {
    // Idempotent: the engine files redefine their globals and content.js guards
    // against double-init, so re-injecting on a subsequent invoke is a no-op.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["sanskrit-search.js", "highlight-core.js", "content.js"]
    });
    await chrome.tabs.sendMessage(tabId, { type: "toggle" });
  } catch (e) {
    // Restricted page (chrome://, Chrome Web Store, other extensions, view-source,
    // file:// without opt-in). Extensions cannot run there — nothing to do.
  }
}

chrome.action.onClicked.addListener(function (tab) { toggleOnTab(tab && tab.id); });

chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== "toggle-search") return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) toggleOnTab(tabs[0].id);
  });
});
