// Toolbar click opens Vinil in Chrome's side panel, so music keeps playing
// while the user browses. A context-menu item opens it in a full tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.create({ id: 'vinil-tab', title: 'Открыть Vinil во вкладке', contexts: ['action'] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'vinil-tab') chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
