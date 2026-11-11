"""Ticket resources, dashboards, sidebar and phone mocks. Imported by gen.py."""
import datetime as dt

import gen
from lib import HERO, ME, OWNERS, ROWS, STAGES, TICKETS, TODAY, TONE, I, av, bname, chip, day, header, page, pct, rp, sidebar, tk

TOTAL = len(ROWS)
out = {}
mi, HINT, CHECK, sel = gen.mi, gen.HINT, gen.CHECK, gen.sel


def frame(side, main, extra=""):
    return f'<div class="frame">{side}<main class="inset">{main}</main>{extra}</div>'


def table_for(views):
    """The default table page, visible in every state of another mock."""
    return gen.TABLE.replace('data-s="default ', f'data-s="{" ".join(views)} default ')


# ============ ticket-resources.html ============
KEY = "KFL-412"
linked = gen.by_date([r for r in ROWS if KEY in r["tickets"]])
assert HERO in linked
others = [r for r in gen.by_date(ROWS) if KEY not in r["tickets"]][:4]

TICKET_CSS = """
.tm{flex:1;min-width:0;overflow:auto;padding:24px 32px}
.tm-in{max-width:720px;display:flex;flex-direction:column;gap:16px}
.tm h1{margin:0;font:600 20px/28px var(--font-sans)}
.tm p{margin:0;color:var(--muted-foreground);font-size:14px;line-height:22px}
.rs{display:flex;flex-direction:column}
.rs-h{height:24px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:var(--muted-foreground)}
.rs-g{height:24px;display:flex;align-items:center;gap:8px;padding:0 8px;font-size:12px;color:var(--faint-foreground)}
.rr{height:32px;display:flex;align-items:center;gap:8px;padding:0 4px 0 8px;border-radius:var(--radius-md);min-width:0}
.rr:hover,.rr.hov{background:var(--accent)}
.rr .tx{flex:1}
.rr .slot{width:24px;flex:none}
.rr .acts{display:none;gap:4px}.rr:hover .acts,.rr.hov .acts,.rr:focus-within .acts{display:inline-flex}.rr:hover>.chip,.rr.hov>.chip,.rr:focus-within>.chip,.rr:hover>.meta,.rr.hov>.meta,.rr:focus-within>.meta{display:none}
.rx{margin:0 0 4px 16px;padding:4px 0 4px 16px;border-left:1px solid var(--input)}
.kv{display:grid;grid-template-columns:var(--label-col) minmax(0,1fr);column-gap:8px}
.kv>*{min-height:28px;display:flex;align-items:center;gap:6px;min-width:0}
.kv .k{color:var(--muted-foreground);font-size:12px}
.kv .wide{grid-column:2/3}
.rx-f{height:32px;display:flex;align-items:center;gap:8px;margin-top:4px;padding-right:4px}
.props{width:280px;flex:none;border-left:1px solid var(--border);background:var(--card);padding:var(--content-gutter);overflow:auto}
.props{--label-col:96px}
.tbody{flex:1;min-height:0;display:flex}
.hr{height:1px;background:var(--border)}
.pop .cb{display:grid}.pop .cb.on{background:var(--primary);border-color:var(--primary)}.pop .cb.on svg{display:block}
.cmt{height:64px;border:1px solid var(--input);border-radius:var(--radius-md);padding:8px;color:var(--faint-foreground)}
"""


def res_row(r, opened):
    demo = ' data-demo="list"' if r is linked[1] else ""
    line = (f'<div class="rr"{demo}><button class="b sm ic" aria-label="{"Collapse" if opened else "Expand"} fields">'
            f'{I("chevron-down" if opened else "chevron-right")}</button>{I("table")}{bname(r["name"])}{"" if opened else chip(r["stage"])}'
            f'<span class="acts"><button class="b sm ic" aria-label="Open row" title="Open row">{I("expand")}</button><button class="b sm ic" aria-label="Unlink row">{I("x")}</button></span></div>')
    if not opened:
        return line
    return line + (
        '<div class="rx"><div class="kv">'
        f'<span class="k">Stage</span><span>{chip(r["stage"])}</span><span class="k">Cost</span><span class="num">{rp(r["cost"])}</span>'
        f'<span class="k">Start date</span><span>{day(r["date"])}</span><span class="k">Owner</span><span>{av(r["owner"])}<span class="tx">{r["owner"]}</span></span>'
        f'<span class="k">Linked tickets</span><span class="wide">{"".join(tk(k, KEY) for k in r["tickets"])}</span>'
        f'<span class="k">Note</span><span class="wide"><span class="tx">{r["note"]}</span></span></div>'
        f'<div class="rx-f"><span class="cnt">Row ID</span><span class="mono mut">{r["id"]}</span><span class="grow"></span>'
        f'<button class="b sm">{I("link")}Copy link</button><button class="b sm out">{I("expand")}Open row</button></div></div>'
    )


def resources(expanded, s):
    return (
        f'<section class="rs" data-s="{s}"><div class="rs-h">Resources<span class="cnt">{len(linked) + 1}</span><span class="grow"></span>'
        f'<button class="b sm ic" aria-label="Link GitHub resource">{I("link")}</button></div>'
        '<div class="rs-g">Pull requests</div>'
        f'<div class="rr"><span class="slot"></span>{I("pr")}<span class="mono mut">kaneo #482</span><a class="tx" href="#">Line 2 checklist: gasket torque step</a>'
        '<span class="meta mut">Open</span>'
        f'<span class="acts"><button class="b sm ic" aria-label="Open pull request" title="Open pull request">{I("external")}</button><button class="b sm ic" aria-label="Unlink pull request">{I("x")}</button></span></div>'
        f'<div class="rs-g">Table rows · {len(linked)} in Pilot batch log</div>'
        + "".join(res_row(r, expanded and r is HERO) for r in linked)
        + f'<span class="anc" style="align-self:flex-start"><button class="b{" act" if s == "link" else ""}">{I("plus")}Link table row</button>{PICKER if s == "link" else ""}</span></section>'
    )


PICKER = (
    '<div class="pop" style="top:32px;left:0;width:420px"><h4>Link a table row to KFL-412</h4>'
    f'<div class="cond" style="grid-template-columns:148px minmax(0,1fr)">{sel("Pilot batch log", "table")}'
    f'<div class="sel">{I("search")}<span class="tx mut">Search rows</span></div></div>'
    + "".join(f'<div class="mi"><span class="cb{" on" if n == 0 else ""}">{I("check")}</span>{bname(r["name"])}{chip(r["stage"])}</div>' for n, r in enumerate(others))
    + f'<div class="pf"><span class="cnt">{len(linked)} of {TOTAL} rows already linked</span><span class="grow"></span>'
      '<button class="b">Cancel</button><button class="b pri">Link 1 row</button></div></div>'
)


def prop(k, v):
    return f'<div class="fr"><div class="k">{k}</div><div class="v">{v}</div></div>'


title, status, tone = TICKETS[KEY]
TV = ["list", "expanded", "link", "sheet"]
ticket = (
    header([("Noovoleum", None), ("Pilot line", "kanban"), (KEY, None)], right=f'<button class="b">{I("link")}Copy link</button><button class="b ic" aria-label="Ticket options">{I("more")}</button>')
    + '<div class="tbody"><div class="tm"><div class="tm-in">'
    f'<h1>{title}</h1><p>Housing on the line 2 filter weeps at the lower gasket once pressure passes 4 bar. Batches run through it since Nov 1 need a retest before release.</p>'
    + resources(False, "list") + resources(False, "link") + resources(True, "expanded sheet")
    + '<div class="hr"></div><div class="rs-h">Activity</div><div class="cmt">Leave a comment</div>'
    "</div></div>"
    '<aside class="props"><div class="fl">'
    + prop("Status", f'<span class="chip t-{tone}">{status}</span>') + prop("Priority", "High")
    + prop("Assignee", av("Ayu Saraswati") + "Ayu Saraswati") + prop("Labels", '<span class="tk">batch-issue</span>')
    + prop("Due date", day(TODAY + dt.timedelta(days=5))) + prop("Board", "Pilot line")
    + "</div></aside></div>"
    + gen.sheet(nav=False)
)
out["ticket-resources.html"] = page(
    "ticket-resources.html", "Ticket resources", frame(sidebar("Pilot line"), ticket),
    [("list", "Linked rows"), ("expanded", "Row expanded"), ("link", "Link picker"), ("sheet", "Open row")], TICKET_CSS,
    note=f"<b>Fixture</b> {KEY} is linked from {len(linked)} of {TOTAL} rows in Pilot batch log (same fixture as table.html). "
         "<b>Shown open for review</b> the hover actions (Open row, unlink) are pinned on the second row in the first state. "
         "Inline expansion is read-only; Open row opens the same row sheet as the table page.")

# ============ dashboards.html ============
DASH_CSS = """
.dg{flex:1;min-height:0;overflow:auto;padding:16px;display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:12px;align-content:start}
.pc{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);display:flex;flex-direction:column;min-width:0}
.pc-h{height:36px;flex:none;display:flex;align-items:center;gap:8px;padding:0 4px 0 12px}
.pc-h b{font-weight:500;white-space:nowrap}
.pc-h .q{flex:1;font-size:12px;color:var(--faint-foreground)}
.pc-h .ha{display:none}.pc:hover .ha,.pc.hov .ha{display:inline-flex}
.pc-b{flex:1;padding:0 12px 12px;display:flex;flex-direction:column;min-width:0}
.stat{font:600 24px/32px var(--font-sans);font-variant-numeric:tabular-nums;white-space:nowrap}
.hb{display:grid;grid-template-columns:112px minmax(0,1fr) 112px;align-items:center;gap:8px;height:24px;font-size:12px}
.hb .bar{height:8px;border-radius:var(--radius-sm);background:var(--t,var(--primary))}
.hb .val{text-align:right;font-variant-numeric:tabular-nums}
.lc{height:140px;display:block;width:100%}
.lc-w{position:relative;padding-left:16px}.lc-y{position:absolute;left:0;transform:translateY(-100%);font-size:12px;line-height:16px;color:var(--faint-foreground)}.lc-x{padding-left:16px;display:flex;justify-content:space-between;font-size:12px;color:var(--faint-foreground);margin-top:4px}
.tr .nm{display:flex;align-items:baseline;gap:8px;min-width:0}.tr{display:grid;grid-template-columns:minmax(0,1fr) 112px;align-items:center;gap:8px;height:28px;border-bottom:1px solid var(--border)}
.tr:last-child{border-bottom:0}
.tr .val{text-align:right;font-variant-numeric:tabular-nums}
.dl{flex:1;min-height:0;overflow:auto}
.dr{height:var(--row-h);display:grid;grid-template-columns:minmax(0,1fr) 160px 160px 40px;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--border)}
.dr.h{color:var(--muted-foreground);font-size:12px;font-weight:500}
a.dr:hover{background:var(--row-hover)}
.dr>:first-child{padding-left:8px}
.dr .nm{display:flex;align-items:center;gap:8px;font-weight:500;min-width:0}
.dlg{position:absolute;left:50%;top:88px;transform:translateX(-50%);width:560px;z-index:10;background:var(--popover);border:1px solid var(--input);border-radius:var(--radius-lg);box-shadow:var(--shadow-pop)}
.dlg .ph{padding:0 8px 0 16px}.dlg .ph b{font-weight:600;font-size:14px}
.dlg-b{padding:16px;display:flex;flex-direction:column;gap:8px}
.dlg-b .fr{grid-template-columns:112px minmax(0,1fr);align-items:center}
.dlg-b .two{display:grid;grid-template-columns:132px minmax(0,1fr);gap:4px}
.seg{display:flex;gap:4px}
.dlg-f{height:52px;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 16px;border-top:1px solid var(--border)}
"""
costed = [r for r in ROWS if r["cost"] is not None]
dated = [r for r in ROWS if r["date"] is not None]
total_cost = sum(r["cost"] for r in costed)
in_qa = sum(1 for r in ROWS if r["stage"] == "In QA")


def panel(span, title, q, inner, demo=""):
    return (f'<section class="pc" style="grid-column:span {span}"{demo}><div class="pc-h"><b>{title}</b><span class="q tx">{q}</span>'
            f'<button class="b sm ic ha" aria-label="Edit panel">{I("pencil")}</button><button class="b sm ic ha" aria-label="Panel options">{I("more")}</button></div>'
            f'<div class="pc-b">{inner}</div></section>')


def stat(title, q, value, sub, demo=""):
    return panel(6, title, q, f'<div class="stat">{value}</div><div class="cnt">{sub}</div>', demo)


def bars(pairs, fmt, tones=None):
    top = max(v for _, v in pairs)
    return "".join(f'<div class="hb{" t-" + tones[k] if tones else ""}"><span class="tx">{k}</span>'
                   f'<span><div class="bar" style="width:{max(1, round(100 * v / top))}%"></div></span><span class="val">{fmt(v)}</span></div>' for k, v in pairs)


def weekly():
    monday = lambda d: d - dt.timedelta(days=d.weekday())  # noqa: E731
    first, last = monday(min(r["date"] for r in dated)), monday(TODAY)
    weeks = [first + dt.timedelta(weeks=n) for n in range((last - first).days // 7 + 1)]
    counts = [sum(1 for r in dated if monday(r["date"]) == w) for w in weeks]
    assert sum(counts) == len(dated)
    top = max(counts)
    pts = " ".join(f"{round(600 * n / (len(weeks) - 1), 1)},{round(130 - 104 * c / top, 1)}" for n, c in enumerate(counts))
    svg = (f'<svg class="lc" viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label="Batches started per week">'
           f'<path d="M0 130H600M0 78H600M0 26H600" stroke="var(--border)" vector-effect="non-scaling-stroke" fill="none"/>'
           f'<polygon points="0,130 {pts} 600,130" fill="var(--primary-soft)"/>'
           f'<polyline points="{pts}" fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>')
    ticks = [weeks[0], weeks[len(weeks) // 3], weeks[2 * len(weeks) // 3], weeks[-1]]
    svg = f'<div class="lc-w"><span class="lc-y" style="top:calc(26 / 140 * 100%)">{top}</span><span class="lc-y" style="top:calc(78 / 140 * 100%)">{top // 2}</span>{svg}</div>'
    return svg + '<div class="lc-x">' + "".join(f"<span>{day(w, False)}</span>" for w in ticks) + "</div>", top, len(weeks)


chart, peak, nweeks = weekly()
by_stage = [(s, sum(1 for r in ROWS if r["stage"] == s)) for s, _ in STAGES]
by_owner = sorted(((o, sum(r["cost"] for r in costed if r["owner"] == o)) for o in OWNERS), key=lambda p: -p[1])
top5 = sorted(costed, key=lambda r: -r["cost"])[:5]
PANELS = (
    stat("Batches", "Count", TOTAL, "rows in Pilot batch log", ' data-demo="view"')
    + stat("Total cost", "Sum of Cost", rp(total_cost), f"{len(costed)} of {TOTAL} rows have a cost")
    + stat("Average cost", "Avg of Cost", rp(round(total_cost / len(costed))), f"over {len(costed)} rows with a cost")
    + stat("In QA", "Count · Stage is In QA", in_qa, f"{pct(in_qa, TOTAL)} of {TOTAL} rows")
    + panel(12, "Batches by stage", "Count by Stage", bars(by_stage, lambda v: f"{v} · {pct(v, TOTAL)}", TONE))
    + panel(12, "Cost by owner", "Sum of Cost by Owner", bars(by_owner, rp))
    + panel(12, "Batches started per week", f"Count by week · {len(dated)} of {TOTAL} dated · peak {peak}", chart)
    + panel(12, "Most expensive batches", "Top 5 by Cost", "".join(
        f'<div class="tr"><span class="nm">{bname(r["name"])}</span><span class="val">{rp(r["cost"])}</span></div>' for r in top5))
)
NPANELS = PANELS.count('class="pc"')
DASHES = [("Pilot overview", dt.date(2026, 11, 11), dt.date(2026, 10, 2)), ("Vendor spend", dt.date(2026, 11, 6), dt.date(2026, 10, 20))]


def dash_tb(s, left, right):
    return f'<div class="tb" data-s="{s}">{left}<span class="grow"></span>{right}</div>'


MORE = f'<button class="b ic" aria-label="Dashboard options">{I("more")}</button>'
ADD = f'<button class="b pri">{I("plus")}Add panel</button>'
editor = (
    '<div class="scrim" data-s="add"></div><div class="dlg" data-s="add" role="dialog" aria-label="Add panel">'
    f'<div class="ph"><b>Add panel</b><span class="grow"></span><button class="b ic" aria-label="Close">{I("x")}</button></div><div class="dlg-b">'
    + '<div class="fr"><div class="k">Title</div><div class="sel"><span class="tx">Cost by stage</span></div></div>'
    + '<div class="fr"><div class="k">Type</div><div class="seg">' + "".join(
        f'<button class="b{" on" if t == "Bar" else ""}">{t}</button>' for t in ("Stat", "Bar", "Line", "Area", "Pie", "Table")) + "</div></div>"
    + f'<div class="fr"><div class="k">Source table</div>{sel("Pilot batch log", "table")}</div>'
    + f'<div class="fr"><div class="k">Metric</div><div class="two">{sel("Sum")}{sel("Cost", "currency")}</div></div>'
    + f'<div class="fr"><div class="k">Group by</div>{sel("Stage", "select")}</div>'
    + f'<div class="fr"><div class="k">Width</div>{sel("Half · 12 of 24 columns")}</div>'
    + '</div><div class="dlg-f"><button class="b lg">Cancel</button><button class="b lg pri">Add panel</button></div></div>'
)
DC = [("Noovoleum", None), ("Pilot overview", "chart")]
dash = (
    f'<div data-s="list" style="display:contents">{header([("Noovoleum", None), ("Dashboards", "chart")])}</div>'
    f'<div data-s="view add empty" style="display:contents">{header(DC)}</div>'
    + dash_tb("list", f'<span class="cnt"><b>{len(DASHES)}</b> dashboards</span>',
              f'<div class="srch">{I("search")}<span>Search dashboards</span></div><button class="b pri">{I("plus")}New dashboard</button>')
    + dash_tb("view add", f'<span class="cnt"><b>{NPANELS}</b> panels</span>',
              f'<button class="b">{I("refresh")}Refresh</button><button class="b" disabled>Save</button>{MORE}{ADD}')
    + dash_tb("empty", '<span class="cnt"><b>0</b> panels</span>', MORE + ADD)
    + '<div class="dl" data-s="list"><div class="dr h"><span>Name</span><span>Updated</span><span>Created</span><span></span></div>'
    + "".join(f'<a class="dr"><span class="nm">{I("chart")}<span class="tx">{n}</span></span><span class="mut">{day(u)}</span>'
              f'<span class="mut">{day(c)}</span><button class="b sm ic" aria-label="Dashboard options">{I("more")}</button></a>' for n, u, c in DASHES)
    + "</div>"
    + f'<div class="dg" data-s="view add">{PANELS}</div>'
    + gen.empty("chart", "No panels yet", "A panel charts one table: pick a metric, optionally group it by a field.", ADD.replace("b pri", "b out"), "empty")
    + editor
)
out["dashboards.html"] = page(
    "dashboards.html", "Dashboards",
    frame(sidebar("Pilot overview").replace('<aside class="sb">', '<aside class="sb" data-s="view add empty">', 1)
          + sidebar("").replace('<aside class="sb">', '<aside class="sb" data-s="list">', 1), dash),
    [("view", "Dashboard"), ("add", "Add panel"), ("empty", "Empty"), ("list", "All dashboards")], DASH_CSS,
    note=f"<b>Fixture</b> all {NPANELS} panels are computed from the {TOTAL}-row Pilot batch log fixture; weekly chart covers {nweeks} weeks. "
         "<b>Shown open for review</b> panel hover actions (edit, options) are pinned on the first panel.")

# ============ sidebar.html ============
SV = ["expanded", "org", "account", "rail", "axis"]
SIDE_CSS = ".axis{position:absolute;top:0;bottom:0;left:22px;width:0;border-left:1px dashed var(--tone-red);z-index:30;pointer-events:none}"
org_menu = (
    '<div class="pop menu" data-s="org" style="top:44px;left:8px;width:256px"><div class="ml">Teams in Noovoleum</div>'
    + mi("users", "All teams") + mi("users", "Platform", CHECK) + mi("users", "Operations") + '<div class="ms"></div><div class="ml">Organizations</div>'
    + f'<div class="mi"><span class="logo">N</span><span class="tx">Noovoleum</span>{CHECK}</div>'
    + f'<div class="mi"><span class="logo">N</span><span class="tx">NevrLabs</span>{HINT("W 2")}</div>'
    + mi("plus", "Add organization") + '<div class="ms"></div><div class="ml">Kaneo 3.3.0</div></div>'
)
account_menu = (
    '<div class="pop menu" data-s="account" style="bottom:56px;left:8px;width:256px">'
    f'<div class="me" style="margin:0">{av(ME[0])}<span class="who"><b class="tx">{ME[0]}</b><span class="tx mut">{ME[1]}</span></span></div>'
    '<div class="ms"></div>'
    + mi("mail", "Invitations", '<span class="cnt">2</span>') + mi("trash", "Trash") + mi("keyboard", "Keyboard shortcuts", HINT("?"))
    + mi("settings", "System administration") + '<div class="ms"></div>'
    + mi("moon", "Theme", HINT("Dark")) + '<div class="ms"></div>' + mi("log-out", "Log out") + "</div>"
)
side = (
    sidebar().replace('<aside class="sb">', '<aside class="sb" data-s="expanded org account">', 1)
    + sidebar(rail=True).replace('<aside class="sb rail">', '<aside class="sb rail" data-s="rail axis">', 1)
)
out["sidebar.html"] = page(
    "sidebar.html", "Sidebar", frame(side, table_for(SV), org_menu + account_menu + '<i class="axis" data-s="axis"></i>'),
    [("expanded", "Expanded"), ("org", "Org + team menu"), ("account", "Account menu"), ("rail", "Collapsed rail"), ("axis", "Rail + axis guide")], SIDE_CSS,
    note="<b>Measurements</b> expanded 240px · identity row 32px, one line (was 44px, two lines) · nav rows 24px, resource rows 28px · footer identity 40px. "
         "Rail 44px wide · every control is a 28px square on one centre axis (x = 22px) · 4px between controls, 12px between groups. "
         "<b>Axis guide</b> the dashed red line is review scaffolding, not product.")

# ============ table-phone.html ============
PHONE_CSS = """
.phone{width:390px;height:844px;margin:0 auto;display:flex;flex-direction:column;position:relative;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
.phone .ph{height:52px;padding:0 4px;gap:0}
.t44{width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:var(--radius-md);color:var(--muted-foreground)}
.phone .crumb{height:44px;font-size:14px;min-width:0}
.prow{height:44px;flex:none;display:flex;align-items:center;padding:0 4px;border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none}
.pb{height:44px;min-width:44px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0 4px;font-weight:500;color:var(--muted-foreground);white-space:nowrap}
.pb>span{height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 8px;border-radius:var(--radius-md)}
.pb[aria-current]>span{background:var(--secondary);color:var(--foreground)}
.pb.on>span{background:var(--primary-soft);color:var(--primary-soft-foreground)}
.pl{flex:1;min-height:0;overflow:auto}
.pr{width:100%;min-height:60px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border)}
.pr>span{display:flex;align-items:center;gap:8px;min-width:0}
.pr .l1 .tx{flex:1;font-weight:500}
.pr .l2{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.pfoot{height:60px;flex:none;display:flex;align-items:center;gap:8px;padding:0 12px;border-top:1px solid var(--input)}
.b.xl{height:44px;padding:0 16px;font-size:14px}
.bs{position:absolute;left:0;right:0;bottom:0;z-index:10;background:var(--popover);border-top:1px solid var(--input);border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow-pop);padding:8px 12px 12px;display:flex;flex-direction:column;gap:8px}
.bs .grab{width:32px;height:4px;border-radius:var(--radius-sm);background:var(--input);align-self:center}
.bs h4{margin:0;font:600 14px/20px var(--font-sans)}
.bs .sel,.full .sel{height:44px}
.pc2{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:4px;padding:8px 0;border-top:1px solid var(--border)}
.pc2 .two{grid-column:1;display:grid;grid-template-columns:132px minmax(0,1fr);gap:4px}
.bs .mi{height:44px;font-size:14px}
.full{position:absolute;inset:0;z-index:10;background:var(--background);display:flex;flex-direction:column}
.full .sh-b{padding:12px}
.full .fr{grid-template-columns:112px minmax(0,1fr)}
.full .fr .k,.full .fr .v{min-height:44px;height:auto}
.full .lr{min-height:44px}
"""


def t44(icon, label):
    return f'<button class="t44" aria-label="{label}">{I(icon, "md")}</button>'


def pb(label, icon=None, cls="", cur=False, aria=""):
    return f'<button class="pb{cls}"{" aria-current=page" if cur else ""}{f' aria-label="{aria}"' if aria else ""}><span>{I(icon) if icon else ""}{label}</span></button>'


def prow(r):
    bits = [x for x in (rp(r["cost"]), day(r["date"], False)) if x]
    return (f'<button class="pr"><span class="l1">{bname(r["name"])}{chip(r["stage"])}</span>'
            f'<span class="l2">{av(r["owner"])}<span class="tx">{" · ".join([r["owner"].split()[0]] + bits)}</span>{"".join(tk(k) for k in r["tickets"])}</span></button>')


def ptools(s, filt=0):
    n = f'<span class="n">{filt}</span>' if filt else ""
    return (f'<div class="prow" data-s="{s}">{pb("Filter" + n, "filter", " on" if filt else "")}{pb('Sort<span class="n">1</span>', "sort", " on")}'
            f'{pb("Group", "rows")}{pb("Fields", "columns")}</div>')


h = HERO
pfilter = (
    '<div class="scrim" data-s="filter"></div><div class="bs" data-s="filter"><span class="grab"></span>'
    f'<div class="pc2">{sel("Stage", "select")}{t44("trash", "Remove condition")}<div class="two">{sel("is any of")}'
    f'<div class="sel">{"".join(chip(x) for x in gen.F_STAGES)}</div></div></div>'
    f'<div class="pc2">{sel("Cost", "currency")}{t44("trash", "Remove condition")}<div class="two">{sel("is at least")}'
    f'<div class="sel num"><span class="tx">{rp(gen.F_MIN)}</span></div></div></div>'
    f'<button class="b xl" style="align-self:flex-start;padding:0 8px">{I("plus")}Add filter</button>'
    f'<div class="pfoot" style="padding:0;border:0"><span class="cnt"><b>{len(gen.filtered)}</b> of {TOTAL} rows · match all</span><span class="grow"></span>'
    '<button class="b xl">Clear filters</button><button class="b xl pri">Done</button></div></div>'
)
pmenu = (
    '<div class="scrim" data-s="menu"></div><div class="bs" data-s="menu"><span class="grab"></span>'
    + mi("upload", "Import CSV") + mi("download", "Export CSV", HINT(f"{TOTAL} rows · this view")) + '<div class="ms"></div><div class="ml">Row height</div>'
    + mi("", "Compact", CHECK) + mi("", "Comfortable") + '<div class="ms"></div>'
    + mi("pencil", "Rename table") + mi("users", "Access") + mi("link", "Copy link") + '<div class="ms"></div>' + mi("trash", "Delete table", cls=" dng") + "</div>"
)


def pfr(name, icon, value):
    return f'<div class="fr"><div class="k">{I(icon)}{name}</div><div class="v">{value}</div></div>'


prow_sheet = (
    f'<div class="full" data-s="row"><div class="ph">{t44("chevron-left", "Back to table")}'
    f'<span class="cnt">Row {gen.HERO_N} of {TOTAL}</span><span class="grow"></span>{t44("link", "Copy link")}{t44("more", "Row options")}</div>'
    f'<div class="sh-b"><h2 class="sh-t">{bname(h["name"])}</h2><div class="fl">'
    + pfr("Stage", "select", chip(h["stage"])) + pfr("Cost", "currency", f'<span class="num">{rp(h["cost"])}</span>')
    + pfr("Start date", "calendar", day(h["date"])) + pfr("Owner", "user", av(h["owner"]) + h["owner"]) + pfr("Note", "longtext", h["note"])
    + f'</div><section class="sh-s"><h5>{I("ticket")}Linked tickets<span class="cnt">{len(h["tickets"])}</span></h5>'
    + "".join(f'<div class="lr">{tk(k)}<span class="tx">{TICKETS[k][0]}</span></div>' for k in h["tickets"])
    + f'<button class="b xl" style="align-self:flex-start;padding:0 8px">{I("plus")}Link ticket</button></section>'
    + f'<section class="sh-s"><h5>System</h5><div class="fl">{pfr("Row ID", "hash", f'<span class="mono">{h["id"]}</span>{t44("copy", "Copy row ID")}')}</div></section></div></div>'
)
PV = "default menu row"
phone = (
    '<div class="phone">'
    f'<header class="ph">{t44("menu", "Open navigation")}<button class="crumb cur">{I("table")}<span class="tx">Pilot batch log</span>{I("chevrons-up-down")}</button>'
    f'<span class="grow"></span>{t44("search", "Search rows")}{t44("more", "Table options")}</header>'
    f'<nav class="prow" aria-label="Views">{pb("All batches", "rows", cur=True)}{pb("By stage", "columns")}{pb("", "plus", aria="Add view")}</nav>'
    + ptools(PV) + ptools("filter", 2)
    + f'<div class="pl" data-s="{PV}">{"".join(prow(r) for r in gen.by_date(ROWS))}</div>'
    + f'<div class="pl" data-s="filter">{"".join(prow(r) for r in gen.filtered)}</div>'
    + f'<div class="pfoot" data-s="{PV}"><span class="cnt"><b>{TOTAL}</b> rows</span><span class="grow"></span><button class="b xl pri">{I("plus")}New row</button></div>'
    + f'<div class="pfoot" data-s="filter"><span class="cnt"><b>{len(gen.filtered)}</b> of {TOTAL} rows</span><span class="grow"></span><button class="b xl pri">{I("plus")}New row</button></div>'
    + pfilter + pmenu + prow_sheet + "</div>"
)
out["table-phone.html"] = page(
    "table-phone.html", "Table · phone 390", phone,
    [("default", "Default"), ("filter", "Filter"), ("menu", "Table menu"), ("row", "Row")], PHONE_CSS, width=390,
    note="<b>Phone rules</b> every target is 44px or taller (ghost buttons keep a 32px visual pill inside a 44px hit box). "
         "Rows render as two-line records; tap opens the row full-screen. Popovers become bottom sheets.")
