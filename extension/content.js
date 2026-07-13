// Burner fill engine. Injected on demand (activeTab), never runs on its own.
// Receives a persona via message, classifies visible form fields, fills them.
(() => {
  if (window.__burnerLoaded) return;
  window.__burnerLoaded = true;

  const RULES = [
    // order matters: more specific first
    ['confirmEmail', /(confirm|verify|repeat|re.?enter).{0,12}(e.?mail)|e.?mail.{0,12}(confirm|again|verification)/i],
    ['confirmPassword', /(confirm|verify|repeat|re.?enter|retype).{0,12}(pass)|pass.{0,20}(confirm|again|repeat)|password2|pass2/i],
    ['email', /e.?mail/i],
    ['username', /user.?name|login.?(id|name)|screen.?name|display.?name|handle|nick/i],
    ['firstName', /first.?name|given.?name|fore.?name|\bfname\b|first$/i],
    ['lastName', /last.?name|family.?name|sur.?name|\blname\b|last$/i],
    ['fullName', /full.?name|your.?name|^name$|contact.?name|real.?name/i],
    ['phone', /phone|mobile|\btel\b|telephone|\bcell\b/i],
    ['password', /pass.?word|passwd|\bpass\b|pwd/i],
    ['dobDay', /(birth|dob|bday).{0,10}day|day.{0,10}(birth|dob)|\bdd\b/i],
    ['dobMonth', /(birth|dob|bday).{0,10}month|month.{0,10}(birth|dob)|\bmm\b/i],
    ['dobYear', /(birth|dob|bday).{0,10}year|year.{0,10}(birth|dob)|\byyyy\b/i],
    ['dob', /birth|\bdob\b|bday/i],
    ['gender', /gender|\bsex\b/i],
  ];

  const AUTOCOMPLETE_MAP = {
    'email': 'email', 'username': 'username', 'given-name': 'firstName',
    'family-name': 'lastName', 'name': 'fullName', 'tel': 'phone',
    'tel-national': 'phone', 'new-password': 'password', 'current-password': 'password',
    'bday': 'dob', 'bday-day': 'dobDay', 'bday-month': 'dobMonth',
    'bday-year': 'dobYear', 'sex': 'gender', 'nickname': 'username',
  };

  function labelText(el) {
    let t = '';
    if (el.labels) for (const l of el.labels) t += ' ' + l.textContent;
    if (el.getAttribute('aria-labelledby')) {
      for (const id of el.getAttribute('aria-labelledby').split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) t += ' ' + n.textContent;
      }
    }
    return t;
  }

  function descriptor(el) {
    return [
      el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
      el.getAttribute('data-testid'), el.autocomplete, labelText(el),
    ].filter(Boolean).join(' ').slice(0, 300);
  }

  function classify(el) {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (AUTOCOMPLETE_MAP[ac]) return AUTOCOMPLETE_MAP[ac];
    const desc = descriptor(el);
    const type = (el.type || '').toLowerCase();
    // classify by rules first so "confirm password" beats type=password
    for (const [kind, re] of RULES) {
      if (re.test(desc)) {
        // guard: don't call something username/name-ish an email if type says email
        if (type === 'email' && kind !== 'email' && !kind.startsWith('confirm')) return 'email';
        return kind;
      }
    }
    if (type === 'email') return 'email';
    if (type === 'tel') return 'phone';
    if (type === 'password') return 'password';
    return null;
  }

  function visible(el) {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  // React/Vue-safe: set via the native prototype setter, then fire events
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  function setSelect(el, matchers, fallbackValue) {
    const opts = Array.from(el.options);
    for (const m of matchers) {
      const hit = opts.find((o) =>
        m.test(o.value) || m.test(o.textContent.trim()));
      if (hit && hit.value !== '') {
        el.focus();
        el.value = hit.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true;
      }
    }
    if (fallbackValue !== undefined) {
      const hit = opts.find((o) => o.value == fallbackValue || o.textContent.trim() == fallbackValue);
      if (hit) {
        el.value = hit.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function fillField(el, kind, p) {
    const tag = el.tagName;
    if (tag === 'SELECT') {
      if (kind === 'gender') {
        const want = p.gender === 'male'
          ? [/^m(ale)?$/i] : [/^f(emale)?$/i];
        return setSelect(el, want);
      }
      if (kind === 'dobDay' || kind === 'dob') return setSelect(el, [], String(p.birthDay));
      if (kind === 'dobMonth') {
        return setSelect(el, [new RegExp(`^${MONTHS[p.birthMonth - 1]}`, 'i')], String(p.birthMonth));
      }
      if (kind === 'dobYear') return setSelect(el, [], String(p.birthYear));
      return false;
    }
    if (el.type === 'radio') {
      if (kind === 'gender') {
        const d = descriptor(el) + ' ' + el.value;
        const re = p.gender === 'male' ? /male|\bm\b/i : /female|\bf\b/i;
        const anti = p.gender === 'male' ? /female/i : null;
        if (re.test(d) && !(anti && anti.test(d))) {
          el.click();
          return true;
        }
      }
      return false;
    }
    if (el.type === 'date') { setValue(el, p.dobISO); return true; }

    const map = {
      email: p.email, confirmEmail: p.email,
      password: p.password, confirmPassword: p.password,
      username: p.username, firstName: p.firstName, lastName: p.lastName,
      fullName: p.fullName, phone: p.phone,
      dobDay: String(p.birthDay), dobMonth: String(p.birthMonth),
      dobYear: String(p.birthYear), dob: p.dobISO,
      gender: p.gender,
    };
    if (!(kind in map)) return false;
    setValue(el, map[kind]);
    return true;
  }

  function collectFields(root) {
    const out = [];
    const els = root.querySelectorAll('input, select, textarea');
    for (const el of els) {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'image', 'file', 'reset'].includes(type)) continue;
      if (!visible(el)) continue;
      out.push(el);
    }
    // include open shadow roots (one level is enough for most sites)
    for (const host of root.querySelectorAll('*')) {
      if (host.shadowRoot) out.push(...collectFields(host.shadowRoot));
    }
    return out;
  }

  function fillPersona(p) {
    const filled = [];
    let genderDone = false;
    for (const el of collectFields(document)) {
      const kind = classify(el);
      if (!kind) continue;
      if (kind === 'gender' && el.type === 'radio' && genderDone) continue;
      if (fillField(el, kind, p)) {
        filled.push(kind);
        if (kind === 'gender') genderDone = true;
        el.style.boxShadow = '0 0 0 2px #ff6a3d80';
        setTimeout(() => { el.style.boxShadow = ''; }, 1600);
      }
    }
    return filled;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'burner-fill') {
      try {
        sendResponse({ ok: true, filled: fillPersona(msg.persona) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }
    return false;
  });
})();
