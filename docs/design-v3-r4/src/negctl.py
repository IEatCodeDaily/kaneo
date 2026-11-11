"""Negative control for render.py: plant known defects in a scratch copy and confirm the render pass fails on each.

Run from docs/design-v3:  python3 -B src/negctl.py <scratch-dir>   then render that dir (GitHub Actions or local render.py).
Never touches the real files.
"""
import pathlib
import shutil
import sys

here = pathlib.Path(__file__).resolve().parent.parent
dst = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) == 2 and not sys.argv[1].startswith("-") else sys.exit("usage: negctl.py <scratch-dir outside the package>")
if dst == here or here in dst.parents:
    sys.exit("refusing: destination is inside the design package")
shutil.rmtree(dst, ignore_errors=True)
(dst / "src").mkdir(parents=True)
for f in here.glob("*.html"):
    shutil.copy(f, dst / f.name)
for f in ("render.py", "render.sh"):
    shutil.copy(here / "src" / f, dst / "src" / f)


def plant(name, old, new):
    p = dst / name
    s = p.read_text()
    assert s.count(old) >= 1, (name, old)
    p.write_text(s.replace(old, new, 1))


# 1. a state whose subject never appears (the link-picker bug)
plant("ticket-resources.html", '<div class="pop" style="top:32px;left:0;width:420px">', '<div class="pop" hidden style="top:32px;left:0;width:420px">')
# 2. a toolbar control knocked off the shared centre line
plant("dashboards.html", ".srch{width:200px;height:28px;", ".srch{width:200px;height:28px;margin-top:8px;")
# 3. a rail control off the axis
plant("sidebar.html", ".sq.bd,.find{", ".sb.rail .sq.bd{margin-left:4px}.sq.bd,.find{")
# 4. a phone target under 44px
plant("table-phone.html", ".t44{width:44px;height:44px;", ".t44{width:36px;height:36px;")
# 5. a second primary button in one view
plant("dashboards.html", '<div class="acts"><button class="b out">', '<div class="acts"><button class="b pri">')
# 6. an open popover whose trigger shows no open state
plant("table.html", 'data-demo="fields" data-cls="act"', 'data-demo="fields" data-cls="zz"')
# 7. a list column off the shared left text edge
plant("dashboards.html", ".dr>:first-child{padding-left:8px}", ".dr>:first-child{padding-left:0}")
# 8. the edit caret leaking into every numeric cell
plant("sidebar.html", ".caret{display:none;", ".caret{display:block;")
print("planted 8 defects in", dst)
