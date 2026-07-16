// Service worker: relay a "toggle" to the active tab's content script when the
// toolbar icon is clicked or the keyboard shortcut fires.
function toggle(tabId) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: 'toggle' }, function () {
    void chrome.runtime.lastError; // ignore "no receiver" on pages without our content script (chrome://, PDF viewer, etc.)
  });
}

chrome.action.onClicked.addListener(function (tab) { toggle(tab && tab.id); });

chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd !== 'toggle-search') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) toggle(tabs[0].id);
  });
});
