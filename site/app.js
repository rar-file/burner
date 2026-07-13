import { generatePersona, siteFromUrl, DEFAULT_SETTINGS } from './generator.js';

const $ = (id) => document.getElementById(id);

// per-visitor demo seed, kept in localStorage so refreshes prove determinism
let seed = localStorage.getItem('burner-demo-seed');
if (!seed) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  seed = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('burner-demo-seed', seed);
}

const data = await (await fetch('personas.json')).json();
const counters = JSON.parse(localStorage.getItem('burner-demo-counters') || '{}');

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

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1100);
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
  rows.forEach(([k, v, mono], i) => {
    const row = document.createElement('div');
    row.className = 'prow';
    row.style.animationDelay = `${i * 45}ms`;
    row.title = 'Click to copy';
    const kk = document.createElement('span');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.className = 'v' + (mono ? ' mono' : '');
    vv.textContent = v;
    row.append(kk, vv);
    row.addEventListener('click', async () => {
      await navigator.clipboard.writeText(v);
      toast(`${k} copied`);
    });
    card.append(row);
  });
}

// aux input for plus/catchall modes
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

// hero embers
const embers = document.querySelector('.embers');
if (embers && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (let i = 0; i < 14; i++) {
    const e = document.createElement('span');
    e.className = 'ember';
    const s = 2 + Math.random() * 3;
    e.style.width = e.style.height = `${s}px`;
    e.style.left = `${8 + Math.random() * 84}%`;
    e.style.setProperty('--drift', `${(Math.random() - 0.5) * 90}px`);
    e.style.animationDuration = `${4.5 + Math.random() * 5}s`;
    e.style.animationDelay = `${Math.random() * 7}s`;
    e.style.background = ['#ff6a3d', '#ffb347', '#ff8a5c'][i % 3];
    embers.append(e);
  }
}

// reveal on scroll
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
