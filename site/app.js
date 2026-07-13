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

/* interactive demo */
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
    cp.textContent = 'copy';
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

/* hero: self-filling browser mockup */
const SHOWCASE = [
  ['netflix.com', 'en_US'], ['spotify.com', 'en_GB'], ['steampowered.com', 'de_DE'],
  ['reddit.com', 'en_US'], ['airbnb.com', 'fr_FR'], ['zalando.com', 'da_DK'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeInto(el, text, mask = false) {
  el.innerHTML = '<span class="txt"></span><span class="caret"></span>';
  const span = el.querySelector('.txt');
  for (let i = 0; i < text.length; i++) {
    span.textContent += mask ? '•' : text[i];
    await sleep(14 + Math.random() * 22);
  }
  el.querySelector('.caret')?.remove();
}

async function heroLoop() {
  const url = $('m-url'), name = $('m-name'), email = $('m-email'),
        pass = $('m-pass'), btn = $('m-btn'), badge = $('m-badge');
  let i = 0;
  for (;;) {
    const [site, locale] = SHOWCASE[i % SHOWCASE.length];
    const p = await generatePersona({
      masterSeed: 'showcase', site, counter: 0, data,
      settings: { ...DEFAULT_SETTINGS, locale },
    });
    url.textContent = `${site}/signup`;
    for (const el of [name, email, pass]) el.textContent = '';
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
    await sleep(2600);
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

/* identity ticker */
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
    pills.push(`<span class="pill"><b>${p.fullName}</b> ${p.email} <span class="loc">${locale}</span></span>`);
  }
  track.innerHTML = pills.join('') + pills.join(''); // duplicate for seamless loop
}
buildTicker();

/* scrollspy */
const spyLinks = [...document.querySelectorAll('[data-spy]')];
const spyTargets = spyLinks.map((a) => document.querySelector(a.getAttribute('href')));
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    spyLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
  }
}, { rootMargin: '-30% 0px -60% 0px' });
spyTargets.forEach((t) => t && spy.observe(t));
