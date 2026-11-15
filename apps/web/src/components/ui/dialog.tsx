"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  type OverlayInset,
  overlayBody,
  overlayClose,
  overlayFooter,
  overlayHeader,
} from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import { i18n } from "@/lib/i18n";

const DialogCreateHandle = DialogPrimitive.createHandle;

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

function DialogTrigger({
  asChild = false,
  children,
  render,
  ...props
}: DialogPrimitive.Trigger.Props & { asChild?: boolean }) {
  const resolvedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={resolvedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Trigger>
  );
}

function DialogClose({
  asChild = false,
  children,
  render,
  ...props
}: DialogPrimitive.Close.Props & { asChild?: boolean }) {
  const resolvedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={resolvedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  );
}

function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  );
}

function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props) {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
        className,
      )}
      data-slot="dialog-viewport"
      {...props}
    />
  );
}

const dialogSizes = {
  sm: "max-w-100",
  md: "max-w-140",
  lg: "max-w-3xl",
  full: "h-[calc(100dvh-2rem)] max-w-none",
} as const;

// No `className`: width is `size`, padding is `inset`. The popup wraps its
// children in the padded body, so plain content is inset without a wrapper.
function DialogPopup({
  children,
  size = "md",
  inset = "default",
  variant = "default",
  showCloseButton = true,
  ...props
}: Omit<DialogPrimitive.Popup.Props, "className"> & {
  size?: keyof typeof dialogSizes;
  inset?: OverlayInset;
  /** `media`: chrome-less lightbox for an image or video. */
  variant?: "default" | "media";
  showCloseButton?: boolean;
}) {
  const media = variant === "media";
  const docked = !media && size !== "full";
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport
        className={cn(
          docked && "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12",
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-popup"
          {...props}
          className={cn(
            "-translate-y-[calc(1.25rem*var(--nested-dialogs))] relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 scale-[calc(1-0.1*var(--nested-dialogs))] flex-col opacity-[calc(1-0.1*var(--nested-dialogs))] transition-[scale,opacity,translate] duration-200 ease-out will-change-transform data-nested:data-ending-style:translate-y-8 data-nested:data-starting-style:translate-y-8 data-nested-dialog-open:origin-top data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0",
            media
              ? "max-w-6xl"
              : "rounded-lg border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5",
            !media && dialogSizes[size],
            docked &&
              "max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:opacity-[calc(1-min(var(--nested-dialogs),1))] max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4",
          )}
        >
          <div
            className={cn(overlayBody, media && "overflow-visible")}
            data-close={showCloseButton && !media}
            data-inset={media ? "none" : inset}
            data-slot="dialog-body"
          >
            {children}
          </div>
          {showCloseButton && !media && (
            <DialogPrimitive.Close
              aria-label={i18n.t("common:actions.close")}
              className={overlayClose}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <XIcon />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  );
}

function DialogHeader({
  visuallyHidden = false,
  ...props
}: Omit<React.ComponentProps<"div">, "className"> & {
  /** Keep the title for assistive tech, draw no bar. */
  visuallyHidden?: boolean;
}) {
  return (
    <div
      data-slot="dialog-header"
      {...props}
      className={visuallyHidden ? "sr-only" : overlayHeader}
    />
  );
}

function DialogFooter(props: Omit<React.ComponentProps<"div">, "className">) {
  return <div data-slot="dialog-footer" {...props} className={overlayFooter} />;
}

function DialogTitle({
  asChild = false,
  className,
  children,
  render,
  ...props
}: DialogPrimitive.Title.Props & { asChild?: boolean }) {
  const resolvedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DialogPrimitive.Title
      className={cn("font-semibold text-sm leading-5", className)}
      data-slot="dialog-title"
      render={resolvedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-ui", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBackdrop,
  DialogBackdrop as DialogOverlay,
  DialogClose,
  DialogCreateHandle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPopup as DialogContent,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
};
