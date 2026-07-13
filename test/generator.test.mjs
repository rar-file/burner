import { generatePersona, siteFromUrl, DEFAULT_SETTINGS } from '../extension/lib/generator.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const data = JSON.parse(readFileSync(new URL('../extension/data/personas.json', import.meta.url)));
const seed = 'a'.repeat(32);
const base = { masterSeed: seed, data, settings: { ...DEFAULT_SETTINGS } };

// determinism: same inputs -> identical persona
const p1 = await generatePersona({ ...base, site: 'netflix.com' });
const p2 = await generatePersona({ ...base, site: 'netflix.com' });
assert.deepStrictEqual(p1, p2, 'same site should be deterministic');

// different site / counter / seed -> different persona
const p3 = await generatePersona({ ...base, site: 'spotify.com' });
const p4 = await generatePersona({ ...base, site: 'netflix.com', counter: 1 });
const p5 = await generatePersona({ ...base, masterSeed: 'b'.repeat(32), site: 'netflix.com' });
for (const [other, why] of [[p3, 'site'], [p4, 'counter'], [p5, 'seed']]) {
  assert.notStrictEqual(p1.email, other.email, `changing ${why} should change persona`);
}

// email modes
const plus = await generatePersona({
  ...base, site: 'netflix.com',
  settings: { ...DEFAULT_SETTINGS, emailMode: 'plus', realEmail: 'me@gmail.com' },
});
assert.match(plus.email, /^me\+netflix\.[a-z2-9]{3}@gmail\.com$/, `plus mode: ${plus.email}`);

const catchall = await generatePersona({
  ...base, site: 'accounts.spotify.com'.replace('accounts.', ''),
  settings: { ...DEFAULT_SETTINGS, emailMode: 'catchall', catchallDomain: 'mydom.io' },
});
assert.match(catchall.email, /^spotify\.[a-z2-9]{3}@mydom\.io$/, `catchall mode: ${catchall.email}`);

assert.match(p1.email, /^[a-z0-9.]+@[a-z0-9.-]+$/, `fake mode: ${p1.email}`);

// plus mode without a configured email falls back to fake, never a broken address
const plusUnset = await generatePersona({
  ...base, site: 'netflix.com',
  settings: { ...DEFAULT_SETTINGS, emailMode: 'plus', realEmail: '' },
});
assert.ok(plusUnset.email.includes('@') && !plusUnset.email.startsWith('+'), 'plus fallback');

// password: length + all character classes
assert.strictEqual(p1.password.length, 16);
for (const re of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%_-]/]) assert.match(p1.password, re);

// phone matches locale format shape
assert.match(p1.phone, /^\(\d{3}\) \d{3}-\d{4}$/, `phone: ${p1.phone}`);

// dob sane and stable-by-construction
assert.ok(p1.birthYear >= 1970 && p1.birthYear <= 2005);
assert.ok(p1.birthDay >= 1 && p1.birthDay <= 28);

// non-latin locale still yields usable ascii username/email
const ja = await generatePersona({
  ...base, site: 'rakuten.co.jp',
  settings: { ...DEFAULT_SETTINGS, locale: 'ja_JP' },
});
assert.match(ja.email, /^[a-z0-9.]+@/, `ja email ascii: ${ja.email}`);
assert.ok(ja.username.length >= 4, `ja username: ${ja.username}`);

// siteFromUrl
assert.strictEqual(siteFromUrl('https://www.netflix.com/signup'), 'netflix.com');
assert.strictEqual(siteFromUrl('https://accounts.google.co.uk/x'), 'google.co.uk');
assert.strictEqual(siteFromUrl('http://localhost:8123/signup.html'), 'localhost');
assert.strictEqual(siteFromUrl('http://127.0.0.1:8123/signup.html'), '127.0.0.1');
assert.strictEqual(siteFromUrl('http://192.168.1.1/admin'), '192.168.1.1');
assert.strictEqual(siteFromUrl('chrome://extensions'), 'extensions');

// every bundled locale generates without throwing
for (const loc of Object.keys(data.locales)) {
  const p = await generatePersona({ ...base, site: 'test.com', settings: { ...DEFAULT_SETTINGS, locale: loc } });
  assert.ok(p.email.includes('@') && p.fullName.length > 2, `locale ${loc}`);
}

console.log('generator: all assertions passed');
console.log('sample persona for netflix.com:', JSON.stringify(p1, null, 2));
