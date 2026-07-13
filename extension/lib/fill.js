// Shared orchestration used by both the popup and the background worker.
import { generatePersona, siteFromUrl, DEFAULT_SETTINGS } from './generator.js';

let _data = null;
export async function loadData() {
  if (!_data) {
    const res = await fetch(chrome.runtime.getURL('data/personas.json'));
    _data = await res.json();
  }
  return _data;
}

export async function getState() {
  const got = await chrome.storage.local.get(['masterSeed', 'settings', 'sites']);
  let { masterSeed } = got;
  if (!masterSeed) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    masterSeed = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await chrome.storage.local.set({ masterSeed });
  }
  return {
    masterSeed,
    settings: { ...DEFAULT_SETTINGS, ...(got.settings || {}) },
    sites: got.sites || {},
  };
}

export async function personaForSite(site, state) {
  const st = state || await getState();
  const data = await loadData();
  const counter = st.sites[site]?.counter || 0;
  const persona = await generatePersona({
    masterSeed: st.masterSeed, site, counter, data, settings: st.settings,
  });
  return { persona, state: st };
}

export async function bumpCounter(site) {
  const st = await getState();
  const entry = st.sites[site] || {};
  entry.counter = (entry.counter || 0) + 1;
  st.sites[site] = entry;
  await chrome.storage.local.set({ sites: st.sites });
}

export async function recordUse(site, persona) {
  const st = await getState();
  const entry = st.sites[site] || { counter: persona.counter };
  entry.firstUsed = entry.firstUsed || Date.now();
  entry.lastUsed = Date.now();
  entry.email = persona.email;
  entry.name = persona.fullName;
  st.sites[site] = entry;
  await chrome.storage.local.set({ sites: st.sites });
}

export async function fillTab(tab) {
  const site = siteFromUrl(tab.url);
  if (!site) return { ok: false, error: 'Cannot fill this page.' };
  const { persona } = await personaForSite(site);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    return { ok: false, error: 'Cannot fill this page.' };
  }
  const res = await chrome.tabs.sendMessage(tab.id, { action: 'burner-fill', persona });
  if (res?.ok && res.filled.length) await recordUse(site, persona);
  return { ok: !!res?.ok, filled: res?.filled || [], persona, site, error: res?.error };
}
