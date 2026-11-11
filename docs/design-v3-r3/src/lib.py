"""Shared pieces for the design-v3 mock generator: icons, fixture, shell.

Stdlib only. Every number shown in a mock is computed from ROWS below, never typed.
Regenerate: python3 docs/design-v3/src/gen.py   (then: python3 docs/design-v3/src/check.py)
page() only builds the document; gen.py __main__ is the single place that writes files.
"""
import base64
import datetime as dt
import pathlib
import random

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent
FONTS = HERE.parents[2] / "apps/web/src/assets/fonts"
TODAY = dt.date(2026, 11, 11)  # fixed reference date for the fixture

# lucide-style 24px stroke icons (one set, one stroke width, rendered through a sprite)
ICONS = {
    "plus": '<path d="M5 12h14M12 5v14"/>',
    "x": '<path d="M18 6 6 18M6 6l12 12"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "chevrons-up-down": '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "filter": '<path d="M3 6h18M7 12h10M10 18h4"/>',
    "sort": '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
    "rows": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 9H3M21 15H3"/>',
    "columns": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    "more": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    "expand": '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    "trash": '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    "upload": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "copy": '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "table": '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
    "text": '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    "select": '<circle cx="12" cy="12" r="10"/><path d="m16 10-4 4-4-4"/>',
    "hash": '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    "currency": '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    "calendar": '<path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    "longtext": '<path d="M15 12H3M17 18H3M21 6H3"/>',
    "ticket": '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2"/>',
    "home": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "inbox": '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    "list-checks": '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "kanban": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    "repo": '<path d="M6 3v12M18 9a9 9 0 0 1-9 9"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
    "chart": '<path d="M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3"/>',
    "settings": '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    "panel-left": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    "pencil": '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7M12 19V5"/>',
    "arrow-down": '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    "arrow-up-right": '<path d="M7 7h10v10M7 17 17 7"/>',
    "eye-off": '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49M14.084 14.158a3 3 0 0 1-4.242-4.242M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143M2 2l20 20"/>',
    "grip": '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    "sigma": '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
    "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "keyboard": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    "refresh": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
    "minus": '<path d="M5 12h14"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "pr": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/>',
}


def I(name, cls=""):
    assert name in ICONS, name
    return f'<svg class="i{" " + cls if cls else ""}" aria-hidden="true"><use href="#i-{name}"/></svg>'


SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + "".join(
    f'<symbol id="i-{k}" viewBox="0 0 24 24">{v}</symbol>' for k, v in ICONS.items()
) + "</svg>"

# ---------- fixture: Pilot batch log (87 rows, all loaded — API page size is 1000) ----------
STAGES = [("Planned", "gray"), ("Mixing", "blue"), ("Curing", "pink"), ("In QA", "amber"), ("Done", "green"), ("Scrapped", "red")]
TONE = dict(STAGES)
OWNERS = {"Raisal Wardana": "blue", "Dimas Pratama": "green", "Ayu Saraswati": "pink", "Budi Santoso": "amber", "Sari Lestari": "red"}
ME = ("Raisal Wardana", "raisal.wardana@noovoleum.com")
TICKETS = {
    "KFL-412": ("Filter housing leak on line 2", "In Progress", "amber"),
    "KFL-388": ("QC retry policy for failed batches", "Todo", "gray"),
    "KFL-401": ("Switch binder supplier", "In Review", "pink"),
    "KFL-397": ("Curing oven calibration drift", "Done", "green"),
    "KFL-420": ("Resin moisture out of spec", "In Progress", "amber"),
    "KFL-415": ("Replace sieve mesh on line 1", "Todo", "gray"),
}
FIELDS = [  # (name, type icon, type label)
    ("Batch name", "text", "Text"), ("Stage", "select", "Single select"), ("Cost", "currency", "Currency"),
    ("Start date", "calendar", "Date"), ("Owner", "user", "User"), ("Linked tickets", "ticket", "Link to ticket"),
    ("Note", "longtext", "Long text"),
]
_MATS = ["Resin lot", "Binder trial", "Filter test", "Resin sieve", "Catalyst blend", "Pigment mix", "Hardener batch", "Solvent wash", "Fiber layup", "Mold release"]
_NOTES = ["Passed QC on second attempt", "Viscosity high, thinned 2%", "Held for moisture retest", "Supplier lot changed mid-run",
          "Oven 2 ran 4°C under setpoint", "Sample sent to external lab", "Rework approved by QA", "Mesh torn, sieved twice"]
_AGE = {"Mixing": (0, 6), "Curing": (3, 14), "In QA": (7, 24), "Done": (15, 86), "Scrapped": (15, 86)}


def _rows():
    r, out = random.Random(388), []
    for n in range(87):
        stage = r.choices([s for s, _ in STAGES], [10, 12, 14, 12, 32, 7])[0]
        out.append({
            "id": "".join(r.choices("abcdefghjkmnpqrstuvwxyz23456789", k=20)),
            "name": f"PB-{1040 + n} · {r.choice(_MATS)} {r.choice('ABCD')}",
            "stage": stage,
            "cost": None if stage == "Planned" and r.random() < 0.5 else r.randrange(480, 3960, 5) * 1000,
            "date": TODAY - dt.timedelta(days=r.randint(*_AGE[stage])) if stage in _AGE else None,
            "owner": r.choice(list(OWNERS)),
            "tickets": sorted(r.sample(list(TICKETS), r.choice([1, 1, 2]))) if r.random() < 0.28 else [],
            "note": r.choice(_NOTES) if r.random() < 0.45 else "",
        })
    out[2].update(name="PB-1042 · Filter test A", stage="Mixing", cost=3_180_000, date=dt.date(2026, 11, 10),
                  owner="Ayu Saraswati", tickets=["KFL-388", "KFL-412"], note="Waiting on filter housing; retest after gasket swap")
    return out


ROWS = _rows()
HERO = ROWS[2]


def rp(v):
    return "" if v is None else f"Rp {v:,}"


def num(v):
    """Grid cells: tabular number only; the unit is shown once, in the field header (Cost · Rp)."""
    return "" if v is None else f"{v:,}"


REF_YEAR = 2026  # fixture "today" is Nov 11, 2026


def day(d, year=None):
    """Current-year dates drop the year (Notion/Linear); other years keep it."""
    if d is None:
        return ""
    show = (d.year != REF_YEAR) if year is None else year
    return d.strftime("%b %-d, %Y" if show else "%b %-d")


def pct(a, b):
    return f"{round(100 * a / b)}%" if b else "0%"


def bname(name):
    """'PB-1042 · Filter test A' -> muted mono key + name (DESIGN-SYSTEM §1.5: IDs are mono 12 muted)."""
    key, _, rest = name.partition(" · ")
    return f'<span class="key">{key}</span><span class="tx">{rest}</span>' if rest else f'<span class="tx">{name}</span>'


def chip(stage):
    return f'<span class="chip t-{TONE[stage]}">{stage}</span>'


def av(name, lg=False):
    return f'<span class="av t-{OWNERS[name]}{" lg" if lg else ""}">{name[0]}</span>'


def tk(key, here=None):
    return f'<span class="mono mut">{key}</span>' if key == here else f'<span class="tk">{key}</span>'


# ---------- shell ----------
def _font(family, file, weight):
    b64 = base64.b64encode((FONTS / file).read_bytes()).decode()
    return f'@font-face{{font-family:"{family}";src:url(data:font/woff2;base64,{b64}) format("woff2");font-weight:{weight};font-display:block}}'


def page(file, title, body, views, css="", width=1280, note=""):
    """views: [(id, label)] — first is the default; toggled via body[data-view] and #hash."""
    kit = (HERE / "kit.css").read_text()
    fonts = _font("Cal Sans UI", "CalSansUI[wght,GEOM]-s.p.c2e3469d.woff2", "300 700") + _font("Paper Mono", "PaperMono-Regular.woff2", "400")
    hide = "".join(f'body[data-view="{v}"] [data-s]:not([data-s~="{v}"]){{display:none!important}}' for v, _ in views)
    btns = "".join(f'<button data-v="{v}" aria-pressed="{str(n == 0).lower()}">{label}</button>' for n, (v, label) in enumerate(views))
    js = ("const B=[...document.querySelectorAll('.spec button')],K=v=>B.some(b=>b.dataset.v===v),"
          "S=v=>{if(!K(v))v=K(document.body.dataset.view)?document.body.dataset.view:B[0].dataset.v;"
          "document.querySelectorAll('[data-demo]').forEach(e=>e.classList.toggle(e.dataset.cls||'hov',e.dataset.demo.split(' ').includes(v)));"
          "document.body.dataset.view=v;B.forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));try{history.replaceState(null,'','#'+v)}catch(e){}};"
          "B.forEach(b=>b.onclick=()=>S(b.dataset.v));S(location.hash.slice(1));"
          "addEventListener('hashchange',()=>S(location.hash.slice(1)));")
    doc = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           f"<title>Kaneo design v3 · {title}</title><style>{fonts}{kit}{css}{hide}</style></head>"
           f'<body data-view="{views[0][0]}" style="--spec-w:{width}px">{SPRITE}'
           f'<div class="stage"><div class="spec"><b>{title}</b>{btns}</div>{body}'
           f'<p class="note">{note}</p></div><script>{js}</script></body></html>')
    assert len(doc) < 500_000, (file, len(doc))  # html_render limit
    return doc  # gen.py writes; importing the generator must never touch the files on disk


def sidebar(current="Pilot batch log", rail=False):
    def nr(icon, label, extra="", tall=False):
        cur = ' aria-current="page"' if label == current else ""
        return f'<a class="nr{" r" if tall else ""}"{cur}>{I(icon)}<span class="tx">{label}</span>{extra}</a>'

    if rail:
        def sq(icon, label, cls=""):
            cur = ' aria-current="page"' if label == current else ""
            return f'<button class="sq{cls}" aria-label="{label}"{cur}>{I(icon, "md")}</button>'
        top = f'<button class="sq" aria-label="Noovoleum · Platform"><span class="logo">N</span></button>{sq("panel-left", "Expand sidebar")}'
        find = sq("search", "Search", " bd") + sq("plus", "New ticket", " bd")
        nav = "".join(sq(i, l) for i, l in [("home", "Home"), ("inbox", "Inbox"), ("list-checks", "My tickets"), ("clock", "Recent")])
        foot = sq("users", "Members") + sq("settings", "Settings") + f'<button class="sq" aria-label="Account">{av(ME[0], True)}</button>'
        return (f'<aside class="sb rail"><div class="col">{top}</div><div class="col">{find}</div><div class="col">{nav}</div>'
                f'<span class="grow"></span><div class="sb-f">{foot}</div></aside>')

    def sec(label, icon, items):
        return (f'<div class="sec"><div class="sec-l">{label}<span class="grow"></span>'
                f'<button class="b sm ic" aria-label="New in {label}">{I("plus")}</button></div>{"".join(nr(icon, x, tall=True) for x in items)}</div>')

    return (
        '<aside class="sb">'
        f'<div class="sb-h"><button class="idt"><span class="logo">N</span><span class="nm">Platform</span>'
        f'<span class="org tx">Noovoleum</span>{I("chevrons-up-down")}</button>'
        f'<button class="sq" aria-label="Collapse sidebar">{I("panel-left", "md")}</button></div>'
        f'<div class="pin"><div class="sb-s"><button class="find">{I("search")}<span>Search</span><span class="kbd">Ctrl K</span></button>'
        f'<button class="sq bd" aria-label="New ticket">{I("plus", "md")}</button></div>'
        f'<nav class="nav">{nr("home", "Home")}{nr("inbox", "Inbox", "<span class=ct>3</span>")}{nr("list-checks", "My tickets")}{nr("clock", "Recent")}</nav></div>'
        '<div class="sb-scroll">'
        + sec("Boards", "kanban", ["Pilot line", "Platform", "IT"])
        + sec("Repos", "repo", ["kaneo", "ucollect-backend-go"])
        + sec("Tables", "table", ["Pilot batch log", "Vendor quotes", "Site inventory"])
        + sec("Dashboards", "chart", ["Pilot overview", "Vendor spend"])
        + "</div>"
        f'<div class="sb-f">{nr("users", "Members")}{nr("settings", "Settings")}'
        f'<button class="me">{av(ME[0])}<span class="who"><b class="tx">{ME[0]}</b><span class="tx">{ME[1]}</span></span>{I("chevrons-up-down")}</button></div>'
        "</aside>"
    )


def header(crumbs, tabs=(), right=""):
    """crumbs: [(label, icon|None)] — last is current and is a switcher (chevrons)."""
    out = []
    for n, (label, icon) in enumerate(crumbs):
        last = n == len(crumbs) - 1
        out.append(f'<button class="crumb{" cur" if last else ""}">{I(icon) if icon else ""}{label}{I("chevrons-up-down") if last else ""}</button>')
    t = ""
    if tabs:
        t = '<nav class="vt" aria-label="Views">' + "".join(
            f'<a{" aria-current=page" if n == 0 else ""}>{I(ic)}{label}</a>' for n, (label, ic) in enumerate(tabs)
        ) + f'<button class="b ic" aria-label="Add view">{I("plus")}</button></nav>'
    return f'<header class="ph">{"<span class=sep>/</span>".join(out)}{t}<span class="grow"></span>{right}</header>'
