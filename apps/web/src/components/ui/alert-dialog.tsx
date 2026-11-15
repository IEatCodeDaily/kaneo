"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { overlayBody, overlayFooter } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";

const AlertDialogCreateHandle = AlertDialogPrimitive.createHandle;

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogBackdrop({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="alert-dialog-backdrop"
      {...props}
    />
  );
}

function AlertDialogViewport({
  className,
  ...props
}: AlertDialogPrimitive.Viewport.Props) {
  return (
    <AlertDialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
        className,
      )}
      data-slot="alert-dialog-viewport"
      {...props}
    />
  );
}

// A confirmation is always the 400px popup: no `className`, no size.
function AlertDialogPopup({
  children,
  ...props
}: Omit<AlertDialogPrimitive.Popup.Props, "className">) {
  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop />
      <AlertDialogViewport className="max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12">
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-popup"
          {...props}
          className="-translate-y-[calc(1.25rem*var(--nested-dialogs))] relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-100 scale-[calc(1-0.1*var(--nested-dialogs))] flex-col rounded-lg border bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-0.1*var(--nested-dialogs))] shadow-lg/5 transition-[scale,opacity,translate] duration-200 ease-out will-change-transform data-nested:data-ending-style:translate-y-8 data-nested:data-starting-style:translate-y-8 data-nested-dialog-open:origin-top data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:opacity-[calc(1-min(var(--nested-dialogs),1))] max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4"
        >
          <div className={overlayBody} data-slot="alert-dialog-body">
            {children}
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogViewport>
    </AlertDialogPortal>
  );
}

// The message block: title over description, inset by the body.
function AlertDialogHeader(
  props: Omit<React.ComponentProps<"div">, "className">,
) {
  return (
    <div
      data-slot="alert-dialog-header"
      {...props}
      className="flex flex-col gap-1"
    />
  );
}

function AlertDialogFooter(
  props: Omit<React.ComponentProps<"div">, "className">,
) {
  return (
    <div data-slot="alert-dialog-footer" {...props} className={overlayFooter} />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("font-semibold text-sm leading-5", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-muted-foreground text-ui", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

function AlertDialogClose(props: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}

export {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBackdrop as AlertDialogOverlay,
  AlertDialogClose,
  AlertDialogCreateHandle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogPopup as AlertDialogContent,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogViewport,
};
