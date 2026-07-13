import { generatePersona, siteFromUrl, DEFAULT_SETTINGS } from './generator.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const data = await (await fetch('personas.json')).json();

/* visitor seed — kept in localStorage so refreshes prove determinism */
let seed = localStorage.getItem('burner-demo-seed');
if (!seed) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  seed = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('burner-demo-seed', seed);
}
const counters = JSON.parse(localStorage.getItem('burner-demo-counters') || '{}');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1100);
}

/* ---------- interactive demo ---------- */
function currentSite() {
  const raw = $('d-site').value.trim().toLowerCase();
  if (!raw) return null;
  return siteFromUrl(raw.includes('://') ? raw : `https://${raw}`);
}

function settings() {
  const mode = $('d-mode').value;
  return {
    ...DEFAULT_SETTINGS,
    emailMode: mode,
    realEmail: mode === 'plus' ? ($('d-aux')?.value.trim() || 'you@gmail.com') : '',
    catchallDomain: mode === 'catchall' ? ($('d-aux')?.value.trim() || 'mydomain.com') : '',
  };
}

async function render() {
  const site = currentSite();
  const card = $('d-card');
  if (!site) { card.innerHTML = ''; return; }
  const p = await generatePersona({
    masterSeed: seed, site, counter: counters[site] || 0, data, settings: settings(),
  });
  card.innerHTML = '';
  const rows = [
    ['Name', p.fullName, false],
    ['Email', p.email, true],
    ['Username', p.username, true],
    ['Password', p.password, true],
    ['Phone', p.phone, false],
    ['Birthday', p.dobISO, false],
  ];
  for (const [k, v, mono] of rows) {
    const row = document.createElement('div');
    row.className = 'prow';
    const kk = document.createElement('span');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.className = 'v' + (mono ? ' mono' : '');
    vv.textContent = v;
    const cp = document.createElement('span');
    cp.className = 'cp';
    cp.textContent = 'click to copy';
    row.append(kk, vv, cp);
    row.addEventListener('click', async () => {
      await navigator.clipboard.writeText(v);
      toast(`${k} copied`);
    });
    card.append(row);
  }
}

function syncAux() {
  const mode = $('d-mode').value;
  let aux = $('d-aux');
  if (mode === 'fake') { aux?.remove(); return render(); }
  if (!aux) {
    aux = document.createElement('input');
    aux.id = 'd-aux';
    aux.className = 'aux';
    aux.spellcheck = false;
    aux.addEventListener('input', render);
    document.querySelector('.demo-top').append(aux);
  }
  aux.placeholder = mode === 'plus' ? 'you@gmail.com' : 'mydomain.com';
  aux.value = '';
  render();
}

$('d-site').addEventListener('input', render);
$('d-mode').addEventListener('change', syncAux);
$('d-regen').addEventListener('click', () => {
  const site = currentSite();
  if (!site) return;
  counters[site] = (counters[site] || 0) + 1;
  localStorage.setItem('burner-demo-counters', JSON.stringify(counters));
  render();
});
render();

/* ---------- hero ID card: regenerating identity papers ---------- */
const SHOWCASE = [
  ['netflix.com', 'en_US'], ['spotify.com', 'en_GB'], ['steampowered.com', 'de_DE'],
  ['reddit.com', 'en_US'], ['airbnb.com', 'fr_FR'], ['zalando.com', 'da_DK'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cardPersona(i) {
  const [site, locale] = SHOWCASE[i % SHOWCASE.length];
  const p = await generatePersona({
    masterSeed: 'showcase', site, counter: 0, data,
    settings: { ...DEFAULT_SETTINGS, locale },
  });
  return { site, p };
}

function setCard(site, p, serial) {
  $('c-site').textContent = site;
  $('c-name').textContent = p.fullName;
  $('c-email').textContent = p.email;
  $('c-dob').textContent = p.dobISO;
  $('c-phone').textContent = p.phone;
  $('c-user').textContent = p.username;
  $('c-no').textContent = `${site.slice(0, 2)}-${String(1000 + serial * 137 % 9000)} · self-issued · non-transferable`;
}

async function cardLoop() {
  const swap = $('id-swap');
  let i = 0;
  const first = await cardPersona(0);
  setCard(first.site, first.p, 0);
  if (reduced) return;
  for (;;) {
    await sleep(4200);
    i++;
    const next = await cardPersona(i);
    swap.classList.add('out');
    await sleep(300);
    setCard(next.site, next.p, i);
    swap.classList.remove('out');
  }
}
cardLoop();

/* ---------- ticker: credits roll of aliases ---------- */
async function buildTicker() {
  const track = $('ticker');
  const locales = Object.keys(data.locales);
  const pills = [];
  for (let i = 0; pills.length < 14 && i < 40; i++) {
    const locale = locales[i % locales.length];
    const p = await generatePersona({
      masterSeed: 'ticker', site: `site${i}.com`, counter: 0, data,
      settings: { ...DEFAULT_SETTINGS, locale },
    });
    // skip non-Latin names: their emails romanize to a fallback and look mismatched
    if (!/^[\x20-\x7eÀ-ɏ]+$/.test(p.fullName)) continue;
    pills.push(`<span class="pill"><b>${p.fullName}</b> — ${p.email}<span class="loc">${locale}</span></span>`);
  }
  track.innerHTML = pills.join('') + pills.join(''); // duplicate for seamless loop
}
buildTicker();
