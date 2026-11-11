"""Generates docs/design-v3/*.html. Stdlib only: python3 docs/design-v3/src/gen.py"""
import datetime as dt

from lib import FIELDS, HERO, OWNERS, ROWS, STAGES, TICKETS, I, av, chip, day, bname, header, num, page, pct, rp, sidebar, tk

TOTAL = len(ROWS)
CRUMBS = [("Noovoleum", None), ("Pilot batch log", "table")]  # org / resource switcher, as board-layout.tsx
TABS = [("All batches", "rows"), ("By stage", "columns")]
NCOL = len(FIELDS)


PICK = (2, 3, 5)  # row numbers ticked in the Selection state


def by_date(rows):  # Start date, newest first; empty dates last (the saved sort of "All batches")
    return sorted(rows, key=lambda r: (r["date"] is None, -(r["date"] or dt.date.min).toordinal(), r["name"]))


def row(r, n):
    demo = ' data-demo="default light sheet phone"' if r is HERO else ""
    sel = " data-sel" if n in PICK else ""
    edit = ' data-demo="default light" data-cls="edit"' if n == 8 else ""
    return (
        f'<div class="gr" role="row"{demo}{sel}>'
        f'<div class="c c0"><span class="rn">{n}</span><span class="cb">{I("check")}</span></div>'
        f'<div class="c c1">{bname(r["name"])}<button class="open" aria-label="Open row" title="Open row">{I("expand")}</button></div>'
        f'<div class="c">{chip(r["stage"])}</div>'
        f'<div class="c r"{edit}>{num(r["cost"])}<span class="caret"></span></div>'
        f'<div class="c">{day(r["date"])}</div>'
        f'<div class="c">{av(r["owner"])}<span class="tx">{r["owner"]}</span></div>'
        f'<div class="c">{tk(r["tickets"][0]) + (f'<span class="cnt">+{len(r["tickets"]) - 1}</span>' if len(r["tickets"]) > 1 else "") if r["tickets"] else ""}</div>'
        f'<div class="c mut"><span class="tx">{r["note"]}</span></div><div class="c"></div></div>'
    )


def head():
    cells = "".join(
        f'<div class="c{" c1" if n == 0 else ""}{" r" if name == "Cost" else ""}" role="columnheader"'
        f'{" data-demo=field data-cls=act" if name == "Cost" else ""}>{I(icon)}<span class="tx">{name}</span>{'<span class="unit">Rp</span>' if name == "Cost" else ""}'
        f'{I("arrow-down") if name == "Start date" else ""}{I("chevron-down", "hm")}{FIELD_MENU if name == "Cost" else ""}</div>'
        for n, (name, icon, _) in enumerate(FIELDS)
    )
    return (f'<div class="gr gh" role="row"><div class="c c0"><span class="cb all">{I("minus")}</span></div>{cells}'
            f'<button class="c add" aria-label="Add field">{I("plus")}</button></div>')


def new_row(label="New row"):
    return f'<button class="gn">{I("plus")}{label}</button>'


def agg(rows):
    """The three summaries switched on in the 'By stage' view: Cost=Sum, Owner=Unique, Linked tickets=Filled."""
    cost = sum(r["cost"] or 0 for r in rows)
    filled = sum(1 for r in rows if r["tickets"])
    return (f'<div class="ag">Sum <b>{num(cost)}</b></div><div></div>'
            f'<div class="ag">Unique <b>{len({r["owner"] for r in rows})}</b></div>'
            f'<div class="ag">Filled <b>{filled}</b> · {pct(filled, len(rows))}</div><div></div><div></div>')


def footer(count, cells=None, s=""):
    blank = "".join(f'<div class="ag"{" data-demo=default" if n == 1 else ""}><span class="calc">Calculate{I("chevron-down")}</span></div>'
                    for n in range(NCOL))
    return f'<div class="gf" data-s="{s}"><div class="f0 cnt">{count}</div>{"<div></div>" + cells if cells else blank}</div>'


def sel(inner, icon=None):
    return f'<div class="sel">{I(icon) if icon else ""}<span class="tx">{inner}</span>{I("chevron-down")}</div>'


def cond(word, field, icon, op, value):
    return (f'<div class="cond"><span class="w">{word}</span>{sel(field, icon)}{sel(op)}{value}'
            f'<button class="b ic" aria-label="Remove condition">{I("trash")}</button></div>')


def mi(icon, label, hint="", cls=""):
    lead = I(icon) if icon else '<span class="slot"></span>' if icon == "" else ""  # "" keeps the icon column in a mixed menu
    return f'<div class="mi{cls}" tabindex="0">{lead}<span class="tx">{label}</span>{hint}</div>'


HINT = '<span class="hint">{}</span>'.format
CHECK = I("check")
FIELD_MENU = (
    '<div class="pop menu" data-s="field" style="top:36px;right:0">'
    + mi("pencil", "Edit field") + mi("chevrons-up-down", "Change type", I("chevron-right")) + '<div class="ms"></div>'
    + mi("arrow-up", "Sort ascending") + mi("arrow-down", "Sort descending") + mi("filter", "Filter by this field")
    + mi("rows", "Group by this field") + '<div class="ms"></div>' + mi("eye-off", "Hide field")
    + mi("trash", "Delete field", cls=" dng") + "</div>"
)

# ---- filters used by the mock: every count below is computed ----
F_STAGES = ("Mixing", "In QA")
F_MIN = 2_000_000
filtered = by_date([r for r in ROWS if r["stage"] in F_STAGES and (r["cost"] or 0) >= F_MIN])
N_MIN = 3_900_000
nomatch = [r for r in ROWS if r["stage"] == "Scrapped" and (r["cost"] or 0) > N_MIN]
assert filtered and not nomatch, (len(filtered), len(nomatch))


def filter_pop(stages, op, amount, s):
    return (
        f'<div class="pop" data-s="{s}" style="top:32px;left:0;width:548px">'
        + cond("Where", "Stage", "select", "is any of", f'<div class="sel">{"".join(chip(x) for x in stages)}<span class="grow"></span>{I("chevron-down")}</div>')
        + cond("and", "Cost", "currency", op, f'<div class="sel num"><span class="tx">{rp(amount)}</span></div>')
        + f'<div class="pf"><button class="b">{I("plus")}Add filter</button><span class="grow"></span><span class="cnt">Rows match all conditions</span><button class="b">Clear filters</button></div></div>'
    )


def cond_row(conds, s, clear=True):
    """Active filters as segmented chips (subject | operator | value | x) — the Boards ActiveFilterChip, reused."""
    chips = "".join(f'<span class="cc"><span>{f}</span><span class="op">{o}</span><span>{v}</span>'
                    f'<button aria-label="Remove {f} filter">{I("x")}</button></span>' for f, o, v in conds)
    tail = '<span class="grow"></span><button class="b sm">Clear filters</button>' if clear else ""
    return f'<div class="cr" data-s="{s}">{chips}<button class="b sm">{I("plus")}Add filter</button>{tail}</div>'


def toolbar(s, filt=0, sort=1, group="", pops="", disabled=False):
    d = " disabled" if disabled else ""
    n = '<span class="n">{}</span>'.format
    return (
        f'<div class="tb" data-s="{s}">'
        f'<span class="anc"><button class="b on" data-demo="fields" data-cls="act"{d}>{I("columns")}Fields{n("1 hidden")}</button>{FIELDS_POP}</span>'
        f'<span class="anc"><button class="b{" on" if filt else ""}" data-demo="filter" data-cls="act"{d}>{I("filter")}Filter{n(filt) if filt else ""}</button>{pops}</span>'
        f'<span class="anc"><button class="b{" on" if sort else ""}" data-demo="sort" data-cls="act"{d}>{I("sort")}Sort{n(sort) if sort else ""}</button>{SORT_POP}</span>'
        f'<button class="b{" on" if group else ""}" data-demo="default group" data-cls="focus"{d}>{I("rows")}Group{": " + group if group else ""}</button>'
        f'<span class="grow"></span><div class="srch"{' aria-disabled="true" style="opacity:.5"' if disabled else ""}>{I("search")}<span>Search rows</span><span class="kbd">/</span></div>'
        f'<span class="anc"><button class="b ic" aria-label="Table options" data-demo="more" data-cls="act"{d}>{I("more")}</button>{MORE_MENU}</span>'
        f'<button class="b pri"{d}>{I("plus")}New row</button></div>'
    )


FIELDS_POP = (
    '<div class="pop" data-s="fields" style="top:32px;left:0;width:280px"><h4>Fields · 7 of 8 shown</h4>'
    + "".join(f'<div class="mi">{I("grip")}{I(icon)}<span class="tx">{name}</span><span class="sw{" on" if on else ""}"></span></div>'
              for name, icon, on in [(n, i, True) for n, i, _ in FIELDS] + [("Vendor quote", "link", False)])
    + f'<div class="pf"><button class="b">{I("plus")}New field</button><span class="grow"></span><button class="b">Show all</button></div></div>'
)
SORT_POP = (
    '<div class="pop" data-s="sort" style="top:32px;left:0;width:400px"><h4>Sort by</h4>'
    f'<div class="cond" style="grid-template-columns:28px minmax(0,1fr) 148px 28px"><span class="b ic">{I("grip")}</span>'
    f'{sel("Start date", "calendar")}{sel("Newest first")}<button class="b ic" aria-label="Remove sort">{I("trash")}</button></div>'
    f'<div class="pf"><button class="b">{I("plus")}Add sort</button><span class="grow"></span><button class="b">Clear</button></div></div>'
)
MORE_MENU = (
    '<div class="pop menu" data-s="more" style="top:32px;right:0;width:240px">'
    + mi("upload", "Import CSV") + mi("download", "Export CSV", HINT(f"{TOTAL} rows · this view")) + '<div class="ms"></div><div class="ml">Row height</div>'
    + mi("", "Compact", CHECK) + mi("", "Comfortable") + '<div class="ms"></div>'
    + mi("pencil", "Rename table") + mi("users", "Access") + mi("link", "Copy link") + '<div class="ms"></div>'
    + mi("trash", "Delete table", cls=" dng") + "</div>"
)


def body(s, inner, grow=True):
    return f'<div class="gbody" data-s="{s}">{inner}</div>'


def grouped():
    out = []
    for stage, _ in STAGES:
        rows = by_date([r for r in ROWS if r["stage"] == stage])
        is_open = stage == "In QA"
        out.append(f'<div class="gg" role="row"><button class="lead">{I("chevron-down" if is_open else "chevron-right")}{chip(stage)}'
                   f'<span class="cnt">{len(rows)} rows</span></button>{agg(rows)}</div>')
        if is_open:
            out += [row(r, n + 1) for n, r in enumerate(rows)] + [new_row(f"New row in {stage}")]
    return "".join(out)


def empty(icon, title, text, acts, s):
    return (f'<div class="empty" data-s="{s}"><span class="em-i">{I(icon, "md")}</span><b>{title}</b><p>{text}</p>'
            f'<div class="acts">{acts}</div></div>')


SUMMARY_MENU = (
    '<div class="pop menu" style="bottom:36px;right:0;width:240px"><div class="ml">Cost · summary</div>'
    + mi(None, "None") + mi(None, "Sum", CHECK) + mi(None, "Average") + mi(None, "Median") + mi(None, "Min") + mi(None, "Max")
    + mi(None, "Range") + '<div class="ms"></div>' + mi(None, "Filled") + mi(None, "Empty") + mi(None, "Unique") + "</div>"
)
picked = [r for n, r in enumerate(by_date(ROWS), 1) if n in PICK]
HERO_N = by_date(ROWS).index(HERO) + 1
assert HERO_N in PICK


def sheet(nav=True):
    """nav=False when opened from a ticket: there is no row order to step through."""
    h = HERO

    def fr(name, icon, value, demo=""):
        return f'<div class="fr"><div class="k">{I(icon)}{name}</div><div class="v"{demo}>{value}</div></div>'

    def lr(lead, title, tail):
        return (f'<div class="lr">{lead}<a class="tx" href="#">{title}</a><span class="tail">{tail}</span>'
                f'<button class="b sm ic x" aria-label="Unlink">{I("x")}</button></div>')

    tickets = "".join(lr(tk(k), TICKETS[k][0], f'<span class="chip t-{TICKETS[k][2]}">{TICKETS[k][1]}</span>') for k in h["tickets"])
    return (
        '<div class="scrim" data-s="sheet"></div><aside class="sheet" data-s="sheet" aria-label="Row details">'
        f'<div class="ph">{I("table")}<span class="mut">Pilot batch log</span>'
        + (f'<span class="sep">/</span><span class="cnt">Row {HERO_N} of {TOTAL}</span>'
           f'<button class="b ic" aria-label="Previous row">{I("arrow-up")}</button><button class="b ic" aria-label="Next row">{I("arrow-down")}</button>' if nav else "")
        + f'<span class="grow"></span><button class="b">{I("link")}Copy link</button><button class="b ic" aria-label="Row options">{I("more")}</button>'
        f'<button class="b ic" aria-label="Close">{I("x")}</button></div>'
        f'<div class="sh-b"><h2 class="sh-t">{bname(h["name"])}</h2><div class="fl">'
        + fr("Stage", "select", chip(h["stage"])) + fr("Cost", "currency", f'<span class="num">{rp(h["cost"])}</span>')
        + fr("Start date", "calendar", day(h["date"])) + fr("Owner", "user", av(h["owner"]) + h["owner"])
        + fr("Note", "longtext", h["note"], " data-demo=sheet")
        + "</div>"
        f'<section class="sh-s"><h5>{I("ticket")}Linked tickets<span class="cnt">{len(h["tickets"])}</span></h5>{tickets}'
        f'<button class="b" style="align-self:flex-start">{I("plus")}Link ticket</button></section>'
        f'<section class="sh-s"><h5>{I("link")}Vendor quote<span class="cnt">1 row in Vendor quotes</span></h5>'
        + lr(I("table"), "VQ-0031 · PT Resindo Kimia · Epoxy resin 200 kg", f'<span class="cnt">{rp(18_400_000)}</span>')
        + f'<button class="b" style="align-self:flex-start">{I("plus")}Link row</button></section>'
        '<section class="sh-s"><h5>System</h5><div class="fl">'
        + fr("Row ID", "hash", f'<span class="mono">{h["id"]}</span><button class="b sm ic" aria-label="Copy row ID">{I("copy")}</button>')
        + fr("Created", "clock", day(h["date"])) + fr("Updated", "clock", "Nov 11, 2026, 09:42")
        + "</div></section></div></aside>"
    )


BASE = "default sort fields field more select sheet light"
GRID = (
    '<div class="g" role="grid">' + head()
    + body(BASE, "".join(row(r, n) for n, r in enumerate(by_date(ROWS), 1)) + new_row())
    + body("filter", "".join(row(r, n) for n, r in enumerate(filtered, 1)) + new_row())
    + body("group", grouped())
    + body("empty", empty("table", "No rows yet", "Add the first batch, or import a CSV. Column headers are matched to fields by name.",
                          f'<button class="b out">{I("plus")}New row</button><button class="b out">{I("upload")}Import CSV</button>', "empty"))
    + body("noresult", empty("filter", "No rows match these filters", f"0 of {TOTAL} rows shown. The rows are still there; the filters hide them.",
                             '<button class="b out">Clear filters</button>', "noresult"))
    + body("loading", "".join(
        '<div class="gr"><div class="c c0"></div>' + "".join(f'<div class="c{" r" if i == 2 else ""}"><span class="sk" style="width:{w + (n * 17) % 30}%"></span></div>'
                                                             for i, w in enumerate((60, 50, 45, 55, 50, 40, 65))) + '<div class="c"></div></div>'
        for n in range(14)))
    + footer(f"<b>{TOTAL}</b> rows", s="default sort fields field more sheet light")
    + footer(f"<b>{len(picked)}</b> of {TOTAL} selected", agg(picked), "select")
    + footer(f"<b>{len(filtered)}</b> of {TOTAL} rows", s="filter")
    + footer(f"<b>{TOTAL}</b> rows · {len(STAGES)} groups", agg(ROWS).replace('<div class="ag">Sum', f'<div class="ag hov">{SUMMARY_MENU}Sum', 1), "group")
    + footer("<b>0</b> rows", s="empty") + footer(f"<b>0</b> of {TOTAL} rows", s="noresult") + footer("Loading rows", s="loading")
    + "</div>"
)
BULK = (
    f'<div class="bulk" data-s="select"><span class="cnt"><b>{len(picked)}</b> of {TOTAL} selected</span><span class="vr"></span>'
    f'<button class="b">{I("pencil")}Set field</button><button class="b">{I("ticket")}Link ticket</button>'
    f'<button class="b">{I("download")}Export CSV</button><button class="b dng">{I("trash")}Delete</button>'
    f'<span class="vr"></span><button class="b ic" aria-label="Clear selection">{I("x")}</button></div>'
)
ACCESS = '<span class="stack">' + "".join(av(o) for o in list(OWNERS)[:3]) + '<span class="av">+2</span></span><span class="cnt">5 with access</span>'
TABLE = (
    header(CRUMBS, TABS, ACCESS)
    + toolbar("default sort fields field more select sheet light")
    + toolbar("filter", filt=2, pops=filter_pop(F_STAGES, "is at least", F_MIN, "filter"))
    + cond_row([("Stage", "is any of", "".join(chip(x) for x in F_STAGES)), ("Cost", "is at least", rp(F_MIN))], "filter")
    + toolbar("noresult", filt=2)
    + cond_row([("Stage", "is", chip("Scrapped")), ("Cost", "is more than", rp(N_MIN))], "noresult", clear=False)
    + toolbar("group", group="Stage") + toolbar("empty") + toolbar("loading", disabled=True)
    + GRID + BULK + sheet()
)
VIEWS = [("default", "Default"), ("fields", "Fields"), ("filter", "Filter"), ("sort", "Sort"), ("field", "Field menu"), ("more", "Table menu"),
         ("group", "Group + summaries"), ("select", "Selection"), ("sheet", "Row sheet"), ("empty", "Empty"),
         ("noresult", "Filtered empty"), ("loading", "Loading"), ("light", "Light")]
out = {"table.html": page(
    "table.html", "Table", f'<div class="frame">{sidebar()}<main class="inset">{TABLE}</main></div>', VIEWS,
    note=f"<b>Fixture</b> Pilot batch log · {TOTAL} rows, all loaded · reference date Nov 11, 2026 · every count and sum is computed from the fixture in src/lib.py. "
         "<b>Shown open for review</b> hover affordances (row checkbox + Open, footer Calculate) and one cell in edit mode are pinned on so a static frame can show them.")}

if __name__ == "__main__":
    import pages

    from lib import OUT

    out.update(pages.out)
    for k, v in out.items():
        (OUT / k).write_text(v)
        print(f"{k} {len(v):,} bytes")
