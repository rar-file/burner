import { fillTab } from './lib/fill.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'burner-fill',
    title: 'Fill with Burner',
    contexts: ['page', 'editable'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'burner-fill' && tab?.id) {
    const res = await fillTab(tab);
    if (res.ok) {
      chrome.action.setBadgeText({ tabId: tab.id, text: String(res.filled.length) });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#ff6a3d' });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 4000);
    }
  }
});
