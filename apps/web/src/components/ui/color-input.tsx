"use client";

import type * as React from "react";

import { cn } from "@/lib/cn";

/** Native colour picker rendered as a compact control-sized swatch. */
function ColorInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="color"
      data-slot="color-input"
      className={cn(
        "size-8 shrink-0 cursor-pointer appearance-none rounded-sm border border-input bg-transparent p-0",
        className,
      )}
      {...props}
    />
  );
}

export { ColorInput };
