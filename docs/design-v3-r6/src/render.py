"""Render every state of every mock to png/ and assert rendered geometry.

Needs Python Playwright + Chromium. Runs on GitHub Actions (.github/workflows/design-render.yml, push to design/render-*);
locally: cd docs/design-v3-r4 && python3 src/gen.py && python3 src/render.py
Reads only the generated *.html (no repo access needed). Exit 1 on any failed assertion.
"""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent.parent
PNG = OUT / "png"
PNG.mkdir(exist_ok=True)
FILES = ["table.html", "ticket-resources.html", "dashboards.html", "sidebar.html", "table-phone.html"]

PROBE = r"""
() => {
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const box = e => { const r = e.getBoundingClientRect(); return {x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; };
  const name = e => (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 32) || e.className);
  const root = document.querySelector('.frame, .phone'), R = box(root), out = [];
  const phone = root.classList.contains('phone');

  if (document.documentElement.scrollWidth > innerWidth) out.push('document scrolls sideways');
  if (!document.fonts.check('500 13px "Cal Sans UI"')) out.push('Cal Sans UI not loaded');
  if (root.querySelector('.key,.mono') && !document.fonts.check('400 12px "Paper Mono"')) out.push('Paper Mono not loaded');

  // 1. text clipped by its own box without an ellipsis (class tx = intended truncation)
  for (const e of root.querySelectorAll('*')) {
    if (!vis(e) || e.closest('svg') || e.classList.contains('tx')) continue;
    const s = getComputedStyle(e);
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && s.display !== 'inline' && e.scrollWidth > e.clientWidth + 1) out.push((s.overflowX === 'visible' ? 'text spills out of its box: ' : 'clipped text: ') + name(e));
  }
  // 2. one-row bars: children stay inside and share one centre line
  for (const bar of root.querySelectorAll('.ph, .tb, .cr, .pfoot, .bulk, .dlg-f')) {
    if (!vis(bar)) continue;
    const B = box(bar);
    for (const c of bar.children) {
      if (!vis(c) || c.classList.contains('pop') || c.classList.contains('grow')) continue;
      const k = box(c);
      if (k.r > B.r + 0.5 || k.x < B.x - 0.5) out.push(`overflows ${bar.className}: ${name(c)}`);
      if (Math.abs((k.y + k.b) / 2 - (B.y + B.b) / 2) > 1) out.push(`off-centre in ${bar.className}: ${name(c)}`);
    }
  }
  // 3. floating layers stay inside the app frame
  for (const p of root.querySelectorAll('.pop, .sheet, .bulk, .dlg, .bs')) {
    if (!vis(p)) continue;
    const k = box(p);
    if (k.x < R.x - 0.5 || k.r > R.r + 0.5 || k.y < R.y - 0.5 || k.b > R.b + 0.5) out.push('layer leaves frame: ' + p.className);
  }
  // 4. grid: every body cell lines up with its header cell
  const head = root.querySelector('.gh');
  if (head && vis(head)) {
    const hx = [...head.children].map(c => box(c).x);
    for (const row of [...root.querySelectorAll('.gbody .gr')].filter(vis).slice(0, 6))
      [...row.children].forEach((c, i) => { if (Math.abs(box(c).x - hx[i]) > 0.5) out.push(`column ${i} misaligned`); });
  }
  // 4b. summary cells: label + value stay inside their own column (right-aligned overflow is invisible to scrollWidth)
  for (const a of root.querySelectorAll('.ag')) {
    if (!vis(a)) continue;
    const A = box(a), rg = document.createRange();
    for (const n of a.childNodes) {
      if (n.nodeType === 1 && (n.classList.contains('pop') || !vis(n))) continue;
      if (n.nodeType === 3 && !n.textContent.trim()) continue;
      rg.selectNodeContents(n);
      const k = rg.getBoundingClientRect();
      if (k.left < A.x + 7.5 || k.right > A.r - 7.5) { out.push('summary spills out of its column: ' + a.textContent.trim().slice(0, 28)); break; }
    }
  }
  // 4i. panel subtitles are never truncated (they carry the denominator and the chart's peak)
  for (const t of root.querySelectorAll('.pc-h .q')) {
    if (vis(t) && t.scrollWidth > t.clientWidth + 1) out.push('panel subtitle truncated: ' + t.textContent.trim().slice(0, 32));
  }
  // 4h. column header labels are never truncated (body cells may ellipsize; a header that does hides the field name)
  for (const t of root.querySelectorAll('.gh .c > .tx')) {
    if (vis(t) && t.scrollWidth > t.clientWidth + 1) out.push('column header truncated: ' + t.textContent.trim());
  }
  for (const m of [...root.querySelectorAll('.gh .c > .hm')].filter(vis)) {
    const k = box(m);
    for (const e of [...m.parentElement.children].filter(e => e !== m && vis(e) && getComputedStyle(e).position !== 'absolute')) {
      const b = box(e);
      if (b.x < k.r - 0.5 && b.r > k.x + 0.5) out.push('header menu chevron overlaps: ' + (m.parentElement.querySelector('.tx') || m.parentElement).textContent.trim());
    }
  }
  // 4g. hover overlays never sit on top of the text they belong to (row "Open" over the name)
  for (const o of root.querySelectorAll('.gr .open')) {
    if (!vis(o)) continue;
    const t = o.parentElement.querySelector('.tx');
    if (t && box(t).r > box(o).x + 0.5) out.push('hover button covers text: ' + t.textContent.trim().slice(0, 24));
  }
  // 4j. list rows at rest: trailing content is flush right (no reserved hover band)
  for (const r of root.querySelectorAll('.rr,.lr')) {
    if (!vis(r) || r.matches(':hover,.hov')) continue;
    const kids = [...r.children].filter(vis); if (!kids.length) continue;
    const end = box(kids[kids.length - 1]).r, edge = box(r).r - parseFloat(getComputedStyle(r).paddingRight);
    if (edge - end > 8) out.push('list row trailing gap ' + Math.round(edge - end) + 'px');
  }
  // 4m. DS §1.7: icons in square tiles are 16px
  for (const s of [...root.querySelectorAll('.t44>svg,.sq>svg,.em-i>svg')].filter(vis)) {
    if (Math.round(box(s).w) !== 16) out.push('tile icon not 16px: ' + Math.round(box(s).w) + 'px in ' + (s.parentElement.getAttribute('aria-label') || s.parentElement.className));
  }
  // 4k. a swapped row stays reachable by keyboard: focusing its title reveals its hidden actions
  for (const r of [...root.querySelectorAll('.rr,.lr')].filter(vis)) {
    const acts = r.querySelector(':scope > .acts, :scope > .x'); if (!acts) continue;
    const t = r.querySelector(':scope > a[href], :scope > button:not(.x)');
    if (!t) { out.push('swapped row has no focusable element: ' + r.textContent.trim().slice(0, 32)); continue; }
    t.focus();
    if (document.activeElement !== t || !vis(acts)) out.push('focus does not reveal row actions: ' + r.textContent.trim().slice(0, 32));
    t.blur();
  }
  // 4l. chart y-labels sit in their gutter, never over the plot
  for (const l of [...root.querySelectorAll('.lc-y')].filter(vis)) {
    const s = l.parentElement.querySelector('svg');
    if (s && box(l).r > box(s).x + 0.5) out.push('chart y-label over the plot: ' + l.textContent);
  }
  // 4c. the edit caret shows only in the one cell that is in edit mode
  if ([...root.querySelectorAll('.caret')].filter(vis).length > 1) out.push('edit caret visible outside the edit cell');
  for (const k of [...root.querySelectorAll('.c.edit .caret')].filter(vis)) {
    const rg = document.createRange(); rg.selectNodeContents(k.parentElement.firstChild);
    if (box(k).x < rg.getBoundingClientRect().right - 0.5) out.push('edit caret inside the value');
  }
  // 4d. a trigger whose popover is open shows its open state
  for (const p of root.querySelectorAll('.anc > .pop')) {
    if (vis(p) && !p.parentElement.querySelector(':scope > button').classList.contains('act')) out.push('open popover, trigger not marked open: ' + name(p.parentElement.querySelector(':scope > button')));
  }
  // 4e. one primary action per view (counted in the top layer when a modal layer is open)
  const top = [...root.querySelectorAll('.full, .dlg, .bs, .sheet')].find(vis) || root;
  const pri = [...top.querySelectorAll('.b.pri')].filter(vis);
  if (pri.length > 1) out.push('more than one primary button: ' + pri.map(name).join(' / '));
  // 4f. list pages: breadcrumb, toolbar label and first list column share one left text edge
  const edge = e => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect().left; };
  const dl = [...root.querySelectorAll('.dl')].find(vis);
  if (dl) {
    const want = edge([...root.querySelectorAll('.ph .crumb')].find(vis));
    const got = [[...root.querySelectorAll('.tb')].find(vis).firstElementChild, ...dl.querySelectorAll('.dr > :first-child')];
    for (const e of got) if (Math.abs(edge(e) - want) > 0.5) out.push(`left text edge ${edge(e)} != ${want}: ` + name(e));
  }
  // 5. collapsed rail: one centre axis, equal squares, equal gaps inside a group
  const rail = [...root.querySelectorAll('.sb.rail')].find(vis);
  if (rail) {
    const sq = [...rail.querySelectorAll('.sq')].map(box), ax = box(rail).x + box(rail).w / 2;
    for (const k of sq) {
      if (Math.abs((k.x + k.r) / 2 - ax) > 0.5) out.push('rail control off axis');
      if (Math.abs(k.w - 28) > 0.5 || Math.abs(k.h - 28) > 0.5) out.push(`rail control ${k.w}x${k.h}`);
    }
    for (const col of rail.querySelectorAll('.col, .sb-f')) {
      const b = [...col.querySelectorAll('.sq')].map(box);
      for (let i = 1; i < b.length; i++) if (Math.abs(b[i].y - b[i - 1].b - 4) > 0.5) out.push('rail gap ' + (b[i].y - b[i - 1].b));
    }
  }
  // 6. target size: 24px desktop, 44px phone
  const min = phone ? 44 : 24;
  for (const e of root.querySelectorAll('button, a, .mi')) {
    if (!vis(e) || e.closest('.kv')) continue;
    const k = box(e);
    if (k.b < R.y || k.y > R.b) continue;
    if (k.h < min - 0.5 || k.w < min - 0.5) out.push(`target ${Math.round(k.w)}x${Math.round(k.h)}: ${name(e)}`);
  }
  // 7. no sub-12px text anywhere in the product
  for (const e of root.querySelectorAll('*')) {
    if (!vis(e) || e.closest('svg')) continue;
    if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
      out.push('text under 12px: ' + name(e));
  }
  const sb = [...root.querySelectorAll('.sb:not(.rail)')].find(vis), idt = sb && sb.querySelector('.idt'), me = sb && sb.querySelector('.me');
  return {fails: [...new Set(out)], m: {
    frame: [R.w, R.h], sidebar: sb && vis(sb) ? box(sb).w : null, identity: idt && vis(idt) ? box(idt).h : null,
    account: me && vis(me) ? box(me).h : null, header: [...root.querySelectorAll('.ph')].filter(vis).map(e => box(e).h)[0] ?? null,
    toolbar: [...root.querySelectorAll('.tb')].filter(vis).map(e => box(e).h)[0] ?? null,
    row: [...root.querySelectorAll('.gbody .gr')].filter(vis).map(e => box(e).h)[0] ?? null,
    rows: [...root.querySelectorAll('.gbody .gr, .pl .pr')].filter(vis).length,
  }};
}
"""

import hashlib

# What each state exists to show. A state whose subject is not on screen fails, however clean the rest is.
EXPECT = {
    "table.html": {"fields": ".pop", "filter": ".pop", "sort": ".pop", "field": ".gh .pop", "more": ".pop", "group": ".gf .pop",
                   "select": ".bulk", "sheet": ".sheet", "empty": ".empty", "noresult": ".empty", "loading": ".sk"},
    "ticket-resources.html": {"list": ".rr", "expanded": ".rx", "link": ".pop", "sheet": ".sheet"},
    "dashboards.html": {"view": ".pc", "add": ".dlg", "empty": ".empty", "list": ".dr"},
    "sidebar.html": {"expanded": ".idt", "org": ".pop", "account": ".pop", "rail": ".sb.rail", "axis": ".axis"},
    "table-phone.html": {"default": ".pr", "filter": ".bs", "menu": ".bs", "row": ".full"},
}

receipt, failed, seen = {}, 0, {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    for name in FILES:
        doc = (OUT / name).read_text()
        phone = "phone" in name
        ctx = browser.new_context(viewport={"width": 440 if phone else 1344, "height": 960 if phone else 900}, device_scale_factor=2 if phone else 1)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        for view in re.findall(r'data-v="([a-z]+)"', doc):
            page.goto(f"file://{OUT / name}#{view}")
            page.evaluate("document.fonts.ready")
            page.mouse.move(2, 2)
            page.evaluate("() => { document.activeElement && document.activeElement.blur(); scrollTo(0, 0); }")
            assert page.evaluate("document.body.dataset.view") == view, (name, view)
            res = page.evaluate(PROBE)
            want = EXPECT[name].get(view)
            if want and not page.locator(want).locator("visible=true").count():
                res["fails"].append(f"state shows no {want}")
            res["fails"] += errors
            shot = f"{name[:-5]}--{view}.png"
            page.locator(".frame, .phone").screenshot(path=str(PNG / shot))
            digest = hashlib.sha256((PNG / shot).read_bytes()).hexdigest()
            if digest in seen:  # a state that paints the same pixels as another state shows nothing of its own
                res["fails"].append(f"renders identically to {seen[digest]}")
            seen[digest] = shot
            receipt[f"{name}#{view}"] = res
            failed += len(res["fails"])
            print(("FAIL" if res["fails"] else "ok  "), shot, json.dumps(res["m"]))
            for f in res["fails"]:
                print("       ", f)
        ctx.close()
    browser.close()

shas = {n: hashlib.sha256((OUT / n).read_bytes()).hexdigest() for n in FILES}
(PNG / "receipt.json").write_text(json.dumps({"html_sha256": shas, "states": receipt}, indent=1))
print(f"{len(receipt)} states rendered · {failed} failed assertions")
sys.exit(1 if failed else 0)
