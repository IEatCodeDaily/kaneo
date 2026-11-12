import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-ui` is a custom font-size token (index.css); without this
// tailwind-merge reads it as a colour and drops it next to `text-foreground`.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["ui"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
