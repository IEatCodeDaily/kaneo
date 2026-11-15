---
name: kaneo-ui
description: Use when adding or changing any UI in apps/web. Names the primitive for each pattern and the rules CI enforces.
---

# Kaneo UI

Dense, dark-first, one indigo accent. The primitives in `apps/web/src/components/ui/`
own every inset, bar height and radius. Feature code composes them and adds
content. If you are typing a padding class onto a dialog, sheet, popover or
card, stop: there is a prop for it.

Decision and sources: `docs/ui-design-language.md`.

## The scale

| What | Allowed | Never |
|---|---|---|
| Spacing | `1 2 3 4 6 8` (4–32px). `gap-1.5` / `px-1.5` only icon-to-label and chips | `0.5 2.5 3.5 5 7 10 12`, `[Npx]` |
| Text | `text-xs` (12, floor) · `text-ui` (13, chrome) · `text-sm` (14, titles and reading) · `text-xl` · `text-2xl` | `text-base`, `text-lg`, `text-[Npx]` |
| Weight | 400 · `font-medium` · `font-semibold` | `font-bold` |
| Radius | `rounded-sm` 4 · `rounded-md` 6 · `rounded-lg` 10 · `rounded-full` | `rounded`, `rounded-xl`, `rounded-[Npx]` |
| Controls | Button `xs` 24 · `sm` 28 (chrome default) · `default` 32 (dialogs, forms) | `h-[34px]`, raw `<button>` |
| Colour | tokens (`text-muted-foreground`, `bg-accent`, `text-primary-soft-foreground`) | `text-foreground/60`, hex, bare `text-primary` |

## Which primitive

| You need | Use | Notes |
|---|---|---|
| A form or picker in a modal | `Dialog` + `DialogContent` | `size="sm"` 400 · default 560 · `lg` 768 · `full` |
| A yes/no confirmation | `AlertDialog` | always 400px; title + description + footer |
| A side panel for one record | `Sheet` + `SheetContent` | `size="sm"` 480 · `lg` ticket drawer |
| An anchored picker or small form | `Popover` + `PopoverContent` | `inset="menu"` 4px (default) · `inset="panel"` 8px |
| A list of actions | `DropdownMenu` | every label sits inside a `DropdownMenuGroup` |
| A settings block | `Card` + `CardHeader` + `CardPanel` | `CardPanel inset="none"` for full-bleed lists |
| Any button | `Button` | `variant` + `size`; icon-only needs `aria-label` |
| Any text field | `Input`, `Textarea`, `Select`, `Checkbox` | never the raw element |

## Dialogs, sheets, confirmations

Write the content. The primitive supplies the 16px inset, the 44px header, the
52px footer and the scroll.

```tsx
// Do
<DialogContent size="sm">
  <DialogHeader>
    <DialogTitle>Add field</DialogTitle>
  </DialogHeader>
  <Input aria-label="Name" />
  <DialogFooter>
    <Button variant="outline">Cancel</Button>
    <Button>Create</Button>
  </DialogFooter>
</DialogContent>
```

```tsx
// Don't — none of this compiles or passes design-lint
<DialogContent className="max-w-md p-0">
  <DialogHeader className="px-6 pt-6">…</DialogHeader>
  <div className="px-6">…</div>
</DialogContent>
```

- Children are laid out as a column with a 16px gap. Group tighter rows in your
  own `<div className="space-y-2">`.
- A `<form>` directly inside the content is transparent to layout: put the
  fields and the `DialogFooter` inside it.
- A search field over a long list: give the list
  `<div className="min-h-0 flex-1 overflow-y-auto">` so the field stays put and
  only the list scrolls.
- Full-bleed content (a two-pane picker, a list with its own rows):
  `inset="none"`.
- Title only for assistive tech: `<DialogHeader visuallyHidden>`.
- A header with its own trailing buttons and the default close: put them in one
  row; the header already reserves the close button's corner.

## Popovers and cards

```tsx
<PopoverContent className="w-64">            {/* list or picker: 4px */}
<PopoverContent inset="panel" className="w-80"> {/* form: 8px */}
<CardPanel inset="none" className="divide-y">   {/* full-bleed list */}
```

`className` on these is for width and layout only. A `p-*` class is rejected.

## What CI enforces

`node scripts/design-lint.mjs` (CI `lint` job):

- Hard rules, zero tolerance: off-scale text and radius, `font-bold`, opacity
  text colours, `className` on dialog/sheet/confirmation slots, padding on
  popover and card slots.
- Ratchet rules: off-scale spacing, `[Npx]` sizes and raw
  `<button>/<input>/<select>/<textarea>` are counted per file in
  `scripts/design-lint-baseline.json`. A file's count may only go down. After
  removing offenders run `node scripts/design-lint.mjs --update-baseline`.
  Never raise a count by hand.
- The web typecheck (CI `web-checks`) gates: the modal primitives do not accept
  `className`.
- `tests/ui-render/render.mjs` opens real dialogs on a seeded app and asserts
  header, body and footer share one 16px inset, plus 44/52px bars and widths.

## Adding a rule

When a review finds a defect a machine could have found, add the rule in the
same change: one entry in `RULES` with `bad` and `good` probes (the script
refuses to run if a probe stops firing), or one state in `OVERLAY_STATES`.
A sweep without a rule decays.

## Before you call UI work done

1. `node scripts/design-lint.mjs` is clean.
2. The render run is green and you looked at the shots for the surface you
   changed, in dark and light, desktop and phone.
3. A new modal surface has a state in `OVERLAY_STATES`.
