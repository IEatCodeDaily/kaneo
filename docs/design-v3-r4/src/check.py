"""Static checks for the design-v3 mocks. Stdlib only: python3 docs/design-v3/src/check.py

Enforces the DESIGN-SYSTEM.md rules that can be checked without a browser. It cannot prove layout:
rendered geometry (overflow, clipping, alignment) still needs a browser pass.
"""
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import gen  # noqa: E402
import pages  # noqa: E402
from lib import OUT, ROWS, STAGES  # noqa: E402

FILES = ["table.html", "ticket-resources.html", "dashboards.html", "sidebar.html", "table-phone.html"]
SPACE = {0, 1, 4, 6, 8, 12, 16, 24, 32}  # 1px = optical nudge only; 6px = inside a control only (icon-to-label gap, chip padding)
RADII = {"var(--radius-sm)", "var(--radius-md)", "var(--radius-lg)", "50%", "0"}
SIZES = {12, 13, 14, 16, 20, 24}
fails = []


def check(ok, msg):
    if not ok:
        fails.append(msg)


BUILT = {**gen.out, **pages.out}  # importing builds in memory only; nothing is written
assert sorted(BUILT) == sorted(FILES), sorted(BUILT)

for name in FILES:
    doc = (OUT / name).read_text()
    check(doc == BUILT[name], f"{name}: bytes on disk differ from generator output (hand-edited or stale; rerun gen.py)")
    css = re.sub(r"url\(data:[^)]*\)", "url()", doc[doc.index("<style>") + 7:doc.index("</style>")])
    product = css[css.index("END TOKENS"):css.index("/* review scaffolding")] + css[css.index("/* app frame */"):]
    html = re.sub(r"<(style|script)>.*?</\1>", "", doc, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", html)

    # render-safe
    check(not re.search(r"https?://|<link|<script src|@import", doc), f"{name}: external resource")
    check(not re.search(r"(?:^|[},])\s*(?:html|body)\s*\{[^}]*(?:height:100%|overflow:hidden|100vh)", css), f"{name}: html/body height or overflow")
    # icons: inline SVG only — no emoji, arrows, dingbats or box glyphs as icons (· — ° are punctuation)
    bad = sorted({ch for ch in text if ord(ch) > 0x2000 and ch not in "—–…"})
    check(not bad, f"{name}: unicode glyphs in product text {bad}")
    check(len(re.findall(r"<use href=\"#i-([a-z-]+)\"", html)) > 20, f"{name}: icon sprite unused")
    for used in set(re.findall(r'<use href="#i-([a-z-]+)"', html)):
        check(f'id="i-{used}"' in doc, f"{name}: missing icon {used}")
    # type scale
    for size in re.findall(r"font-size:(\d+(?:\.\d+)?)px", product) + re.findall(r"font:(?:\d00 )?(\d+(?:\.\d+)?)px", product):
        check(float(size) in SIZES, f"{name}: font-size {size}px off scale")
    check(not re.search(r"font-size:\s*\d", html), f"{name}: inline font-size")
    # radius set
    for r in re.findall(r"border-radius:([^;}]+)", product):
        for part in r.split():
            check(part in RADII, f"{name}: radius {part} off scale")
    # spacing scale: gap / padding / margin values
    for prop, val in re.findall(r"(?<![a-z-])(gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?):([^;}]+)", product):
        for part in val.replace("!important", "").split():
            m = re.fullmatch(r"-?(\d+)px", part)
            if m:
                check(int(m.group(1)) in SPACE, f"{name}: {prop}:{val} off the spacing scale")
            else:
                check(part in ("0", "auto") or part.startswith("var(--"), f"{name}: {prop}:{val} not a token")
    # one accent: no raw colours outside the token block
    check(not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", product.replace("#fff", "")), f"{name}: raw colour outside tokens")
    # every state the switcher offers has content
    for view in re.findall(r'data-v="([a-z]+)"', doc):
        check(re.search(rf'data-s="[^"]*\b{view}\b', doc) or view in ("default", "light"), f"{name}: state {view} selects nothing")

# contrast: small text needs 4.5:1 on every surface it sits on, in both themes
def lum(hex_):
    ch = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    r, g, b = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in ch]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


kit = (pathlib.Path(__file__).parent / "kit.css").read_text()
def tokens(block):  # hex tokens only; #abc is expanded so a short form can never fall through to another theme
    found = re.findall(r"(--[a-z-]+):#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])", block)
    return {k: "#" + (v if len(v) == 6 else "".join(ch * 2 for ch in v)) for k, v in found}


cut = kit.index('body[data-view="light"]')
dark, light_only = tokens(kit[:cut]), tokens(kit[cut:kit.index("derived tokens")])
light = {**dark, **light_only}
for surface in ("--sidebar", "--background", "--card", "--popover", "--foreground", "--muted-foreground", "--faint-foreground"):
    check(surface in light_only, f"light theme does not define {surface} (would inherit dark)")
for theme, tok in (("dark", dark), ("light", light)):
    for fg in ("--foreground", "--muted-foreground", "--faint-foreground", "--destructive-foreground",
               "--tone-gray", "--tone-blue", "--tone-pink", "--tone-amber", "--tone-green", "--tone-red"):
        for bg in ("--sidebar", "--background", "--card", "--popover"):
            c = ratio(tok[fg], tok[bg])
            check(c >= 4.5, f"contrast {theme} {fg} on {bg} = {c:.2f}")
    check(ratio("#ffffff", tok["--primary"]) >= 4.5, f"contrast {theme} primary button")
    for bg in ("--background", "--card", "--popover"):  # outline-only controls (checkbox) and the focus ring need 3:1
        check(ratio(tok["--faint-foreground"], tok[bg]) >= 3 and ratio(tok["--primary"], tok[bg]) >= 3, f"contrast {theme} control outline on {bg}")

# contrast on tinted surfaces: chips and avatars (tone text on a 16% tint of itself), the applied button, tinted rows
def mix(fg, bg, a):
    f, b = ([int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in (fg, bg))
    return "#" + "".join(f"{round(a * x + (1 - a) * y):02x}" for x, y in zip(f, b))


def oklab(h):
    lin = [(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))]
    l, m, s = (sum(k * v for k, v in zip(row, lin)) ** (1 / 3) for row in (
        (0.4122214708, 0.5363325363, 0.0514459929), (0.2119034982, 0.6806995451, 0.1073969566), (0.0883024619, 0.2817188376, 0.6299787005)))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


assert "var(--t) 16%,transparent" in kit and "16%,var(--card)" in kit, "chip/avatar tint changed: update this check"
soft_alpha = dict(zip(("dark", "light"), (float(a) for a in re.findall(r"--primary-soft:rgba\([\d,]+,(\.\d+)\)", kit))))
for theme, tok in (("dark", dark), ("light", light)):
    for tone in ("gray", "blue", "pink", "amber", "green", "red"):
        c = tok[f"--tone-{tone}"]
        for bg in ("--background", "--card", "--popover"):
            r = ratio(c, mix(c, tok[bg], 0.16))
            check(r >= 4.5, f"contrast {theme} chip/avatar {tone} on tinted {bg} = {r:.2f}")
        for other in ("gray", "blue", "pink", "amber", "green", "red"):
            if other > tone:
                dd = sum((x - y) ** 2 for x, y in zip(oklab(c), oklab(tok[f"--tone-{other}"]))) ** 0.5
                check(dd >= 0.10, f"{theme} tones {tone}/{other} too close (ΔE_ok {dd:.3f})")
        de = sum((x - y) ** 2 for x, y in zip(oklab(c), oklab(tok["--primary-soft-foreground"]))) ** 0.5
        check(de >= 0.10, f"{theme} tone {tone} reads as the accent (ΔE_ok {de:.3f} from applied text)")
        sel_bg = mix(tok["--primary"], tok["--background"], 0.14)
        r = ratio(c, mix(c, sel_bg, 0.16))
        check(r >= 4.5, f"contrast {theme} chip {tone} on selected row = {r:.2f}")
    r = ratio(tok["--primary-soft-foreground"], mix(tok["--primary"], tok["--background"], soft_alpha[theme]))
    check(r >= 4.5, f"contrast {theme} applied toolbar button = {r:.2f}")
    for label, bg in (("selected row", mix(tok["--primary"], tok["--background"], 0.14)),
                      ("hover row", mix(tok["--foreground"], tok["--background"], 0.04))):
        for fg in ("--foreground", "--muted-foreground", "--faint-foreground"):
            r = ratio(tok[fg], bg)
            check(r >= 4.5, f"contrast {theme} {fg} on {label} = {r:.2f}")

# honest counts: recompute what the mocks print
table = (OUT / "table.html").read_text()
check(f"<b>{len(ROWS)}</b> rows" in table, "table: total row count")
check(f"<b>{len(gen.filtered)}</b> of {len(ROWS)} rows" in table, "table: filtered count")
check(table.count('class="gr" role="row"') == len(ROWS) + len(gen.filtered) + sum(1 for r in ROWS if r["stage"] == "In QA"), "table: rendered rows vs fixture")
check(sum(sum(1 for r in ROWS if r["stage"] == s) for s, _ in STAGES) == len(ROWS), "table: groups do not partition rows")
check(f"<b>{len(gen.picked)}</b> of {len(ROWS)} selected" in table, "table: selection count")
check(f"Sum <b>{gen.num(sum(r['cost'] or 0 for r in ROWS))}</b>" in table, "table: grand total cost")  # unit lives in the Cost header (§1.5)
check(f"<b>{pages.NPANELS}</b> panels" in (OUT / "dashboards.html").read_text(), "dashboards: panel count")
check(f"{len(pages.linked)} in Pilot batch log" in (OUT / "ticket-resources.html").read_text(), "ticket: linked row count")

# renders: png/ must have been made from the bytes on disk
import hashlib  # noqa: E402
import json  # noqa: E402

receipt = OUT / "png" / "receipt.json"
if receipt.exists():
    data = json.loads(receipt.read_text())
    for name in FILES:
        same = data.get("html_sha256", {}).get(name) == hashlib.sha256((OUT / name).read_bytes()).hexdigest()
        check(same, f"{name}: png/ was rendered from different bytes (rerun src/render.sh on the build host)")
    bad = sum(len(v["fails"]) for v in data.get("states", {}).values())
    check(len(data.get("states", {})) == 30 and bad == 0, f"png/receipt.json: {len(data.get('states', {}))} states, {bad} failed assertions")
else:
    print("note: no png/receipt.json, rendered geometry not checked")

print("\n".join(fails) or f"OK · {len(FILES)} files · all static checks pass")
sys.exit(1 if fails else 0)
