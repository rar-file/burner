import { siteFromUrl, DEFAULT_SETTINGS } from '../lib/generator.js';
import { getState, personaForSite, bumpCounter, fillTab, loadData } from '../lib/fill.js';

const $ = (id) => document.getElementById(id);
let tab = null;
let site = null;
let persona = null;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1200);
}

async function copy(text, label) {
  await navigator.clipboard.writeText(text);
  toast(`${label} copied`);
}

function renderCard(p) {
  const rows = [
    ['Name', p.fullName],
    ['Email', p.email],
    ['Username', p.username],
    ['Password', p.password, true],
    ['Phone', p.phone],
    ['Birthday', p.dobISO],
  ];
  const card = $('card');
  card.innerHTML = '';
  for (const [label, value, mask] of rows) {
    const row = document.createElement('div');
    row.className = 'frow';
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = mask ? '•'.repeat(Math.min(value.length, 14)) : value;
    v.title = 'Click to copy';
    if (mask) {
      let shown = false;
      v.addEventListener('mouseenter', () => { v.textContent = value; shown = true; });
      v.addEventListener('mouseleave', () => { v.textContent = '•'.repeat(Math.min(value.length, 14)); shown = false; });
    }
    v.addEventListener('click', () => copy(value, label));
    const c = document.createElement('button');
    c.className = 'copy';
    c.textContent = '⧉';
    c.title = `Copy ${label.toLowerCase()}`;
    c.addEventListener('click', () => copy(value, label));
    row.append(k, v, c);
    card.append(row);
  }
}

async function refreshPersona() {
  if (!site) {
    $('card').innerHTML = '<div class="empty">Open a website to get an identity for it.</div>';
    $('fill').disabled = true;
    $('regen').disabled = true;
    return;
  }
  ({ persona } = await personaForSite(site));
  renderCard(persona);
}

async function renderSites() {
  const { sites } = await getState();
  const list = $('sites-list');
  list.innerHTML = '';
  const entries = Object.entries(sites)
    .filter(([, v]) => v.lastUsed)
    .sort((a, b) => b[1].lastUsed - a[1].lastUsed);
  if (!entries.length) {
    list.innerHTML = '<div class="empty">Nothing filled yet.</div>';
    return;
  }
  for (const [domain, v] of entries) {
    const el = document.createElement('div');
    el.className = 'site-entry';
    const date = new Date(v.lastUsed).toLocaleDateString();
    el.innerHTML = `<div class="d"></div><div class="e"></div><div class="m"></div>`;
    el.querySelector('.d').textContent = domain;
    el.querySelector('.e').textContent = v.email || '';
    el.querySelector('.m').textContent = `${v.name || ''} · ${date}`;
    el.title = 'Click to copy email';
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => v.email && copy(v.email, 'Email'));
    list.append(el);
  }
}

async function renderSettings() {
  const { settings, masterSeed } = await getState();
  const data = await loadData();
  const sel = $('set-locale');
  sel.innerHTML = '';
  for (const loc of Object.keys(data.locales).sort()) {
    const o = document.createElement('option');
    o.value = loc;
    o.textContent = loc;
    sel.append(o);
  }
  sel.value = settings.locale;
  $('set-emailmode').value = settings.emailMode;
  $('set-realemail').value = settings.realEmail;
  $('set-catchall').value = settings.catchallDomain;
  $('set-pwlen').value = settings.passwordLen;
  $('set-seed').value = masterSeed;
  syncEmailFields();
}

function syncEmailFields() {
  const mode = $('set-emailmode').value;
  $('wrap-realemail').hidden = mode !== 'plus';
  $('wrap-catchall').hidden = mode !== 'catchall';
}

function show(view) {
  for (const v of ['persona', 'sites', 'settings']) {
    $(`view-${v}`).hidden = v !== view;
    $(`nav-${v}`).classList.toggle('active', v === view);
  }
  if (view === 'sites') renderSites();
  if (view === 'settings') renderSettings();
}

$('nav-persona').addEventListener('click', () => show('persona'));
$('nav-sites').addEventListener('click', () => show('sites'));
$('nav-settings').addEventListener('click', () => show('settings'));
$('set-emailmode').addEventListener('change', syncEmailFields);
$('copy-seed').addEventListener('click', () => copy($('set-seed').value, 'Seed'));

$('fill').addEventListener('click', async () => {
  const status = $('fill-status');
  status.className = 'status';
  status.textContent = 'Filling…';
  const res = await fillTab(tab);
  if (res.ok && res.filled.length) {
    status.className = 'status ok';
    const kinds = [...new Set(res.filled)];
    status.textContent = `Filled ${res.filled.length} fields (${kinds.slice(0, 4).join(', ')}${kinds.length > 4 ? '…' : ''})`;
  } else if (res.ok) {
    status.className = 'status err';
    status.textContent = 'No signup fields found on this page.';
  } else {
    status.className = 'status err';
    status.textContent = res.error || 'Could not fill this page.';
  }
});

$('regen').addEventListener('click', async () => {
  await bumpCounter(site);
  await refreshPersona();
  toast('New identity');
});

$('save-settings').addEventListener('click', async () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    locale: $('set-locale').value,
    emailMode: $('set-emailmode').value,
    realEmail: $('set-realemail').value.trim(),
    catchallDomain: $('set-catchall').value.trim().replace(/^@/, ''),
    passwordLen: Math.max(8, Math.min(40, parseInt($('set-pwlen').value, 10) || 16)),
  };
  const seed = $('set-seed').value.trim();
  const patch = { settings };
  if (/^[0-9a-f]{16,64}$/i.test(seed)) patch.masterSeed = seed.toLowerCase();
  await chrome.storage.local.set(patch);
  const s = $('settings-status');
  s.className = 'status ok';
  s.textContent = 'Saved.';
  setTimeout(() => { s.textContent = ''; }, 1500);
  await refreshPersona();
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  site = tab?.url ? siteFromUrl(tab.url) : null;
  $('site').textContent = site || 'no site';
  // First-run nudge: if email mode is fake and no real email set, that's fine,
  // but surface plus-mode once so users discover traceable emails.
  const { settings } = await getState();
  if (settings.emailMode === 'plus' && !settings.realEmail) {
    show('settings');
    $('settings-status').className = 'status err';
    $('settings-status').textContent = 'Set your real email to use tagged mode.';
  }
  await refreshPersona();
})();
