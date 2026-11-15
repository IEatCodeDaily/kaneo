// One inset for every modal surface (Dialog, AlertDialog, Sheet): the 16px
// content gutter of DESIGN-SYSTEM §1.2. The body owns it; header and footer
// bleed to the edges through the same variable, so the three cannot disagree
// and a caller has nothing to remember. A direct-child <form> is transparent to
// layout and passes the surface fill on, so sticky bars inside it stay opaque.
export type OverlayInset = "default" | "none";

export const overlayBody =
  "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain rounded-[inherit] bg-inherit p-(--overlay-inset) [--overlay-inset:--spacing(4)] data-[inset=none]:gap-0 data-[inset=none]:[--overlay-inset:0px] [&>form]:contents [&>form]:bg-inherit";

// 44px bar (28px controls fit). A visible description makes it a two-line
// header with 8px above and below. A header directly followed by the footer
// drops its rule, so a title-only dialog does not draw two lines.
export const overlayHeader =
  "-top-(--overlay-inset) -mx-(--overlay-inset) -mt-(--overlay-inset) sticky z-10 flex min-h-11 shrink-0 flex-col justify-center border-b bg-inherit px-4 py-1 in-data-[close=true]:pe-11 has-[+[data-slot$='-footer']]:border-b-0 has-[>[data-slot$='-description']:not(.sr-only)]:py-2";

// 52px bar, actions right-aligned.
export const overlayFooter =
  "-bottom-(--overlay-inset) -mx-(--overlay-inset) -mb-(--overlay-inset) sticky z-10 mt-auto flex min-h-13 shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-inherit px-4 py-2";

export const overlayClose = "absolute end-2 top-2 z-20";
