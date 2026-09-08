const origin = (
  import.meta.env["VITE_SITE_URL"] || "http://localhost:3000"
).replace(/\/$/, "");

export function siteUrl(path: string): string {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
