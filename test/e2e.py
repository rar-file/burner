#!/usr/bin/env python3
"""End-to-end: load Burner in Chromium, open the fixture signup page, drive the
real popup's Fill button, assert the form got filled correctly.

The extension copy used here gets host_permissions for 127.0.0.1 patched in,
because activeTab (the production grant) requires a real user gesture on the
toolbar icon, which automation can't produce. Everything else is identical.
"""
import http.server
import json
import shutil
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
SCRATCH = Path("/tmp/claude-0/-root/63488c63-91e6-4c21-97dd-b7ced5183232/scratchpad/burner-e2e")
def build_test_extension():
    ext = SCRATCH / "extension"
    if ext.exists():
        shutil.rmtree(ext)
    shutil.copytree(ROOT / "extension", ext)
    manifest = json.loads((ext / "manifest.json").read_text())
    manifest["host_permissions"] = ["http://127.0.0.1/*"]
    (ext / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return ext

def serve_fixtures():
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=str(ROOT / "test"), **kw)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def main():
    ext = build_test_extension()
    srv = serve_fixtures()
    port = srv.server_address[1]
    SCRATCH.joinpath("profile").mkdir(parents=True, exist_ok=True)
    failures = []

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(SCRATCH / "profile"),
            channel="chromium",  # full chromium's new headless; headless_shell can't load extensions
            headless=True,
            args=[
                f"--disable-extensions-except={ext}",
                f"--load-extension={ext}",
            ],
        )
        try:
            sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
            ext_id = sw.url.split("/")[2]
            print(f"extension loaded: {ext_id}")

            page = ctx.new_page()
            page.goto(f"http://127.0.0.1:{port}/signup.html")

            # Open the real popup page. chrome.tabs.query in a tab-hosted popup
            # returns the popup itself, so point it at the signup tab instead.
            popup = ctx.new_page()
            popup.add_init_script("""
              if (chrome?.tabs?.query) {
                const orig = chrome.tabs.query.bind(chrome.tabs);
                chrome.tabs.query = async (q) => {
                  const tabs = await orig({});
                  const hit = tabs.filter(t => t.url && t.url.startsWith('http'));
                  return hit.length ? hit : orig(q);
                };
              }
            """)
            popup.goto(f"chrome-extension://{ext_id}/popup/popup.html")
            expect(popup.locator("#site")).to_have_text("127.0.0.1")
            expect(popup.locator(".frow")).to_have_count(6)
            email_before = popup.locator(".frow").nth(1).locator(".v").inner_text()
            print(f"persona email: {email_before}")
            popup.screenshot(path=str(SCRATCH / "popup.png"))

            # determinism across popup reloads
            popup.reload()
            expect(popup.locator(".frow")).to_have_count(6)
            email_after = popup.locator(".frow").nth(1).locator(".v").inner_text()
            if email_before != email_after:
                failures.append(f"not deterministic across reloads: {email_before} vs {email_after}")

            # the actual product action
            popup.click("#fill")
            expect(popup.locator("#fill-status")).to_contain_text("Filled", timeout=8000)
            status = popup.locator("#fill-status").inner_text()
            print(f"popup status: {status}")

            v = lambda sel: page.eval_on_selector(sel, "el => el.value")
            checks = {
                "first name":   v("[name=fname]") != "",
                "last name":    v("[name=lname]") != "",
                "email":        "@" in v("[name=email]"),
                "confirm email":  v("[name=email_confirm]") == v("[name=email]"),
                "email matches persona": v("[name=email]") == email_before,
                "username":     len(v("#username")) >= 4,
                "password len": len(v("[name=password]")) == 16,
                "confirm pass": v("[name=password_repeat]") == v("[name=password]"),
                "phone":        any(c.isdigit() for c in v("[type=tel]")),
                "dob day":      v("[name=dob_day]") != "",
                "dob month":    v("[name=dob_month]") != "",
                "dob year":     int(v("[name=dob_year]") or 0) in range(1970, 2006),
                "date input":   v("[name=bday]").count("-") == 2,
                "gender radio": page.eval_on_selector_all(
                    "[name=gender]", "els => els.some(e => e.checked)"),
                "tos untouched": not page.eval_on_selector("[name=tos]", "el => el.checked"),
            }
            for name, ok in checks.items():
                print(f"  {'PASS' if ok else 'FAIL'}  {name}")
                if not ok:
                    failures.append(name)

            page.screenshot(path=str(SCRATCH / "filled-form.png"), full_page=True)

            # regenerate gives a different identity, then sites history has the entry
            popup.click("#regen")
            popup.wait_for_timeout(300)
            email_regen = popup.locator(".frow").nth(1).locator(".v").inner_text()
            if email_regen == email_before:
                failures.append("regenerate did not change persona")
            else:
                print(f"  PASS  regenerate ({email_regen})")

            popup.click("#nav-sites")
            expect(popup.locator(".site-entry")).to_have_count(1)
            print("  PASS  sites history recorded")
            popup.screenshot(path=str(SCRATCH / "popup-sites.png"))
        finally:
            ctx.close()
            srv.shutdown()

    if failures:
        print(f"\nE2E FAILED: {failures}")
        sys.exit(1)
    print("\nE2E: all checks passed")

if __name__ == "__main__":
    main()
