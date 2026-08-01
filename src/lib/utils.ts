import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

/** Extract an Archive.org identifier from a /details/ URL, or pass through a raw ID. */
export function parseBookId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes("/")) return trimmed;
  const match = trimmed.match(/archive\.org\/details\/([^/?#]+)/);
  return match?.[1] ?? trimmed.split("/").pop() ?? trimmed;
}
