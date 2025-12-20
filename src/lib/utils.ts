import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BUNNY_CDN_URL = 'https://basheer-ab.b-cdn.net';

/**
 * Ensures a storage URL has the full CDN prefix.
 * Handles both relative paths and already-complete URLs.
 */
export function getFullCdnUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  
  // Already a full URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  return `${BUNNY_CDN_URL}/${cleanPath}`;
}
