#!/usr/bin/env python3
"""Seed a fresh Kaneo (built image + Postgres) through its real API, then screenshot real pages.

Runs in CI (.github/workflows/ui-render.yml). Desktop 1440x900 and phone 390x844, both themes on desktop.
Fails on any page error, on a known error-boundary string, or when a page renders no content.
Writes PNGs + checks.json to OUT.
"""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173")
OUT = os.environ.get("OUT", "shots")
os.makedirs(OUT, exist_ok=True)
EMAIL, PASS = "render@local.test", "render-password-123"
BAD = ("This view failed", "unexpected error", "Something went wrong")


def wait_healthy():
    for _ in range(90):
        try:
            if urllib.request.urlopen(f"{BASE}/api/health", timeout=3).status == 200:
                return
        except Exception:
            pass
        time.sleep(2)
    sys.exit("api never became healthy")


def seed(req):
    def post(path, data):
        r = req.post(f"{BASE}/api{path}", data=data, headers={"Origin": BASE})
        assert r.ok, f"POST {path} -> {r.status} {r.text()[:300]}"
        return r.json() if r.text() else {}

    post("/auth/sign-up/email", {"email": EMAIL, "password": PASS, "name": "Ayu Saraswati"})
    org = post("/auth/organization/create", {"name": "Noovoleum", "slug": "noov"})
    post("/auth/organization/set-active", {"organizationId": org["id"]})
    post("/auth/organization/update", {"organizationId": org["id"], "data": {"tablesEnabled": True}})
    board = post("/board", {"name": "Pilot line", "organizationId": org["id"], "icon": "Rocket", "slug": "KFL"})
    for t, st, pr in [("Filter housing leak on line 2", "in-progress", "high"), ("QC retry policy for failed batches", "to-do", "medium"),
                      ("Gasket torque checklist", "in-review", "low"), ("Supplier audit notes", "done", "no-priority")]:
        post(f"/task/{board['id']}", {"title": t, "description": "seeded", "status": st, "priority": pr})
    tbl = post(f"/data-table/organization/{org['id']}", {"name": "Pilot batch log"})
    fields = {}
    for name, typ, opts in [("Batch", "text", None), ("Stage", "select", {"choices": [{"id": c, "label": c, "color": col} for c, col in
                              [("Mixing", "#06b6d4"), ("Curing", "#ec4899"), ("In QA", "#f59e0b"), ("Done", "#22c55e")]]}),
                             ("Cost", "currency", {"code": "IDR"}), ("Start date", "date", None), ("Note", "longtext", None)]:
        body = {"name": name, "type": typ}
        if opts:
            body["options"] = opts
        fields[name] = post(f"/data-table/organization/{org['id']}/{tbl['id']}/fields", body)
    for i, (nm, stg, cost) in enumerate([("PB-1042 Filter test A", "Mixing", 3180000), ("PB-1043 Hardener batch D", "Curing", 2450000),
                                         ("PB-1044 Solvent wash C", "Done", 1725000), ("PB-1045 Fiber layup D", "In QA", 4100000)]):
        vals = {fields["Stage"]["id"]: stg, fields["Cost"]["id"]: cost, fields["Start date"]["id"]: f"2026-11-{10 - i:02d}",
                fields["Note"]["id"]: "Retest after gasket swap" if i == 0 else ""}
        vals[fields["Batch"]["id"]] = nm
        post(f"/data-table/organization/{org['id']}/{tbl['id']}/rows", {"values": vals})
    return org, board, tbl


def main():
    wait_healthy()
    checks = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        org, board, tbl = seed(ctx.request)
        slug = org["slug"]
        pages = {
            "board": f"/dashboard/organization/{slug}/board/{board.get('slug') or 'KFL'}/board",
            "my-tickets": f"/dashboard/organization/{slug}/my-tasks",
            "table": f"/dashboard/organization/{slug}/table/{tbl['id']}",
            "settings": "/dashboard/settings/account/authentication",
        }
        state = ctx.storage_state()
        for theme in ("dark", "light"):
            for name, path in pages.items():
                for vw, vh, tag in ((1440, 900, "desktop"), (390, 844, "phone")):
                    if tag == "phone" and theme == "light":
                        continue
                    c = browser.new_context(viewport={"width": vw, "height": vh}, storage_state=state, reduced_motion="reduce",
                                            device_scale_factor=2 if tag == "phone" else 1)
                    c.add_init_script(f"localStorage.setItem('user-preferences', JSON.stringify({{state:{{theme:'{theme}'}},version:0}}))")
                    pg, errs = c.new_page(), []
                    pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
                    pg.goto(BASE + path, wait_until="networkidle")
                    pg.wait_for_timeout(1200)
                    pg.evaluate("document.activeElement && document.activeElement.blur()")
                    text = pg.evaluate("document.body.innerText")
                    fails = errs + [f"error text: {b}" for b in BAD if b in text]
                    if len(text.strip()) < 40:
                        fails.append("page rendered no content")
                    hdr = pg.evaluate("(() => { const h = document.querySelector('header'); return h ? Math.round(h.getBoundingClientRect().height) : null })()")
                    shot = f"{name}--{tag}-{theme}.png"
                    pg.screenshot(path=os.path.join(OUT, shot))
                    checks[shot] = {"fails": fails, "header_h": hdr, "url": pg.url}
                    print(("FAIL " if fails else "ok   ") + shot, json.dumps({"header_h": hdr}), *fails, sep="\n      " if fails else " ")
                    c.close()
        browser.close()
    json.dump(checks, open(os.path.join(OUT, "checks.json"), "w"), indent=1)
    bad = sum(len(v["fails"]) for v in checks.values())
    print(f"{len(checks)} shots · {bad} failures")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
