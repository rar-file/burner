// Burner persona generator.
// Every field is derived deterministically from SHA-256(masterSeed:site:counter)
// via sfc32. The draw order below is a compatibility contract: changing it, or
// the data bundle order, changes every persona users already rely on.

const TWO_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'co.jp', 'or.jp', 'ne.jp', 'com.br', 'com.mx', 'co.in',
  'co.za', 'com.sg', 'com.tr', 'com.cn', 'com.hk', 'co.kr',
]);

export function siteFromUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  // IP literals aren't domains — use them whole
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  const n = TWO_PART_TLDS.has(lastTwo) ? 3 : 2;
  return parts.slice(-n).join('.');
}

function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

async function rngFor(masterSeed, site, counter) {
  const input = `${masterSeed}:${site}:${counter}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const v = new DataView(digest);
  const rand = sfc32(v.getUint32(0), v.getUint32(4), v.getUint32(8), v.getUint32(12));
  for (let i = 0; i < 12; i++) rand(); // warm up
  return rand;
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// "becky", "van der berg" -> "Becky", "Van Der Berg"; no-op for CJK
const titleCase = (s) => s.replace(/(^|[\s'-])(\p{Ll})/gu, (m, sep, ch) => sep + ch.toUpperCase());
const digit = (rand, min = 0) => String(min + Math.floor(rand() * (10 - min)));

function slug(s) {
  // ASCII-fold accents; non-Latin scripts fall back to a neutral handle
  const folded = s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  return folded;
}

function makeUsername(rand, first, last) {
  let f = slug(first), l = slug(last);
  if (!f && !l) { f = 'user'; l = ''; }
  const nn = digit(rand) + digit(rand);
  const patterns = [
    `${f}${l}${nn}`,
    `${f}.${l}${nn}`,
    `${f[0] || ''}${l}${nn}`,
    `${f}${nn}`,
    `${f}_${l}`,
  ];
  return pick(rand, patterns).replace(/^[._]+|[._]+$/g, '') || `user${nn}`;
}

function makePhone(rand, format) {
  // group-leading digits are 2-9: libphonenumber-style validators reject
  // US area codes/exchanges starting with 0 or 1
  let out = '';
  let prevWasDigit = false;
  for (const ch of format) {
    if (ch === '#') {
      out += digit(rand, prevWasDigit ? 0 : 2);
      prevWasDigit = true;
    } else {
      out += ch;
      prevWasDigit = /\d/.test(ch); // literal prefix digits (e.g. "+81 90-…") count
    }
  }
  return out;
}

const PW_SETS = [
  'abcdefghijkmnpqrstuvwxyz',
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  '23456789',
  '!@#$%_-',
];

function makePassword(rand, len) {
  const all = PW_SETS.join('');
  const chars = PW_SETS.map((set) => pick(rand, set.split('')));
  while (chars.length < len) chars.push(pick(rand, all.split('')));
  // deterministic Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function makeEmail(rand, { site, first, last, settings, localeData }) {
  const tag = Array.from({ length: 3 }, () =>
    pick(rand, 'abcdefghjkmnpqrstuvwxyz23456789'.split(''))).join('');
  const siteName = slug(site.split('.')[0]).slice(0, 20) || 'site';

  const mode = settings.emailMode;
  if (mode === 'plus' && settings.realEmail && settings.realEmail.includes('@')) {
    const [local, domain] = settings.realEmail.split('@');
    return `${local}+${siteName}.${tag}@${domain}`;
  }
  if (mode === 'catchall' && settings.catchallDomain) {
    return `${siteName}.${tag}@${settings.catchallDomain.replace(/^@/, '')}`;
  }
  // fake mode, or fallback when plus/catchall isn't configured yet
  const f = slug(first) || 'alex';
  const l = slug(last) || 'smith';
  const nn = digit(rand) + digit(rand);
  const local = pick(rand, [`${f}.${l}${nn}`, `${f}${l}${nn}`, `${f[0]}${l}${nn}`]);
  return `${local}@${pick(rand, localeData.domains)}`;
}

// data: parsed personas.json  settings: {locale, emailMode, realEmail, catchallDomain, passwordLen}
export async function generatePersona({ masterSeed, site, counter = 0, data, settings }) {
  const locales = data.locales;
  const locale = locales[settings.locale] ? settings.locale : 'en_US';
  const ld = locales[locale];
  const rand = await rngFor(masterSeed, site, counter);

  // Draw order is frozen — see header comment.
  const gender = rand() < 0.5 ? 'male' : 'female';
  const firstList = ld[gender].length ? ld[gender] : ld[gender === 'male' ? 'female' : 'male'];
  const first = titleCase(pick(rand, firstList));
  const last = titleCase(pick(rand, ld.last));
  const username = makeUsername(rand, first, last);
  const birthYear = 1970 + Math.floor(rand() * 36); // fixed years, ages stay stable
  const birthMonth = 1 + Math.floor(rand() * 12);
  const birthDay = 1 + Math.floor(rand() * 28);
  const phone = makePhone(rand, ld.phone);
  const email = makeEmail(rand, { site, first, last, settings, localeData: ld });
  const password = makePassword(rand, settings.passwordLen || 16);

  const pad = (n) => String(n).padStart(2, '0');
  return {
    site, counter, locale, gender,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    username, email, phone, password,
    birthDay, birthMonth, birthYear,
    dobISO: `${birthYear}-${pad(birthMonth)}-${pad(birthDay)}`,
  };
}

export const DEFAULT_SETTINGS = {
  locale: 'en_US',
  emailMode: 'fake', // switches to 'plus' automatically once realEmail is set
  realEmail: '',
  catchallDomain: '',
  passwordLen: 16,
};
