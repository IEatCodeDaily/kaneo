import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

// ui/dialog reads the close label from the real i18n bootstrap.
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));

const slot = (name: string) =>
  document.querySelector<HTMLElement>(`[data-slot="${name}"]`);

// The trigger case (KFL-395): a dialog whose author wrote plain children and
// no body wrapper. The primitive, not the caller, must supply the inset.
describe("modal primitives own their inset", () => {
  it("wraps plain dialog children in the padded body", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add field</DialogTitle>
          </DialogHeader>
          <input aria-label="name" />
          <DialogFooter>
            <button type="button">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const body = slot("dialog-body");
    expect(body).not.toBeNull();
    expect(body?.className).toContain("p-(--overlay-inset)");
    expect(body?.className).toContain("[--overlay-inset:--spacing(4)]");
    // header, content and footer are siblings inside the one padded box
    for (const child of [
      slot("dialog-header"),
      document.querySelector("input"),
      slot("dialog-footer"),
    ])
      expect(child?.parentElement).toBe(body);
  });

  it("derives header and footer bleed from the body inset", () => {
    render(
      <Dialog open>
        <DialogContent inset="none">
          <DialogHeader>
            <DialogTitle>Pick</DialogTitle>
          </DialogHeader>
          <DialogFooter />
        </DialogContent>
      </Dialog>,
    );
    expect(slot("dialog-body")?.dataset.inset).toBe("none");
    for (const name of ["dialog-header", "dialog-footer"]) {
      expect(slot(name)?.className).toContain("-mx-(--overlay-inset)");
      expect(slot(name)?.className).toContain("px-4");
    }
  });

  it("ignores a className smuggled past the types", () => {
    const smuggled = { className: "p-0 max-w-md" } as object;
    render(
      <Dialog open>
        <DialogContent {...smuggled}>
          <DialogHeader {...smuggled}>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
          <DialogFooter {...smuggled} />
        </DialogContent>
      </Dialog>,
    );
    for (const name of ["dialog-popup", "dialog-header", "dialog-footer"])
      expect(slot(name)?.className).not.toContain("p-0");
    expect(slot("dialog-popup")?.className).toContain("max-w-140");
  });

  it("gives confirmations and sheets the same body", () => {
    render(
      <>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter />
          </AlertDialogContent>
        </AlertDialog>
        <Sheet open>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Row</SheetTitle>
            </SheetHeader>
            <p>fields</p>
          </SheetContent>
        </Sheet>
      </>,
    );
    expect(slot("alert-dialog-body")?.className).toBe(
      slot("sheet-body")?.className,
    );
    expect(slot("alert-dialog-popup")?.className).toContain("max-w-100");
    expect(slot("sheet-popup")?.className).toContain("sm:max-w-120");
  });
});
