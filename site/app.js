import { generatePersona, siteFromUrl, DEFAULT_SETTINGS } from './generator.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const data = await (await fetch('personas.json')).json();

/* ---------- visitor seed (localStorage → determinism survives refresh) ---------- */
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
  $('d-shown').textContent = site || '…';
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
  rows.forEach(([k, v, mono], i) => {
    const row = document.createElement('div');
    row.className = 'prow';
    row.style.animationDelay = `${i * 42}ms`;
    const kk = document.createElement('span');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.className = 'v' + (mono ? ' mono' : '');
    vv.textContent = v;
    const cp = document.createElement('span');
    cp.className = 'cp';
    cp.textContent = 'copy';
    row.append(kk, vv, cp);
    row.addEventListener('click', async () => {
      await navigator.clipboard.writeText(v);
      toast(`${k} copied`);
    });
    card.append(row);
  });
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
  toast('New identity minted');
});
render();

/* ---------- hero: self-filling browser mockup ---------- */
const SHOWCASE = [
  ['netflix.com', 'en_US'], ['spotify.com', 'en_GB'], ['steampowered.com', 'de_DE'],
  ['reddit.com', 'en_US'], ['rakuten.co.jp', 'ja_JP'], ['airbnb.com', 'fr_FR'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeInto(el, text, mask = false) {
  el.classList.add('typing');
  el.innerHTML = '<span class="txt"></span><span class="caret"></span>';
  const span = el.querySelector('.txt');
  for (let i = 0; i < text.length; i++) {
    span.textContent += mask ? '•' : text[i];
    await sleep(14 + Math.random() * 22);
  }
  el.classList.remove('typing');
  el.classList.add('done');
  el.querySelector('.caret')?.remove();
}

async function heroLoop() {
  const url = $('m-url'), name = $('m-name'), email = $('m-email'),
        pass = $('m-pass'), btn = $('m-btn'), badge = $('m-badge');
  if (!url) return;
  let i = 0;
  for (;;) {
    const [site, locale] = SHOWCASE[i % SHOWCASE.length];
    const p = await generatePersona({
      masterSeed: 'showcase', site, counter: 0, data,
      settings: { ...DEFAULT_SETTINGS, locale },
    });
    url.textContent = `${site}/signup`;
    for (const el of [name, email, pass]) { el.textContent = ''; el.className = 'm-input'; }
    badge.classList.remove('show');
    await sleep(650);
    await typeInto(name, p.fullName);
    await typeInto(email, p.email);
    await typeInto(pass, p.password.slice(0, 12), true);
    await sleep(280);
    btn.classList.add('press');
    await sleep(160);
    btn.classList.remove('press');
    badge.classList.add('show');
    await sleep(2500);
    i++;
  }
}

async function heroStatic() {
  const p = await generatePersona({
    masterSeed: 'showcase', site: 'netflix.com', counter: 0, data,
    settings: { ...DEFAULT_SETTINGS },
  });
  $('m-url').textContent = 'netflix.com/signup';
  $('m-name').textContent = p.fullName;
  $('m-email').textContent = p.email;
  $('m-pass').textContent = '••••••••••••';
  $('m-badge').classList.add('show');
}

if (reduced) heroStatic(); else heroLoop();

/* ---------- identity ticker ---------- */
async function buildTicker() {
  const track = $('ticker');
  if (!track) return;
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
    pills.push(`<span class="pill"><b>${p.fullName}</b> ${p.email} <span class="loc">${locale}</span></span>`);
  }
  track.innerHTML = pills.join('') + pills.join(''); // duplicate for seamless loop
}
buildTicker();

/* ---------- embers ---------- */
const embers = document.querySelector('.embers');
if (embers && !reduced) {
  for (let i = 0; i < 16; i++) {
    const e = document.createElement('span');
    e.className = 'ember';
    const s = 2 + Math.random() * 3;
    e.style.width = e.style.height = `${s}px`;
    e.style.left = `${5 + Math.random() * 90}%`;
    e.style.setProperty('--drift', `${(Math.random() - 0.5) * 110}px`);
    e.style.animationDuration = `${4.5 + Math.random() * 5.5}s`;
    e.style.animationDelay = `${Math.random() * 8}s`;
    e.style.background = ['#ff6a3d', '#ffb347', '#ff8a5c'][i % 3];
    embers.append(e);
  }
}

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ---------- scrollspy ---------- */
const spyLinks = [...document.querySelectorAll('[data-spy]')];
const spyTargets = spyLinks.map((a) => document.querySelector(a.getAttribute('href')));
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    spyLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
  }
}, { rootMargin: '-30% 0px -60% 0px' });
spyTargets.forEach((t) => t && spy.observe(t));

/* ---------- cursor glow on cards ---------- */
if (matchMedia('(hover: hover)').matches) {
  document.addEventListener('mousemove', (ev) => {
    const card = ev.target.closest?.('.glow-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    card.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }, { passive: true });
}
