import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(255);

// Well-known disposable/temporary email domains.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "emailondeck.com",
]);

async function domainAcceptsMail(domain: string): Promise<boolean> {
  try {
    // DNS-over-HTTPS lookup for MX records.
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return true; // Don't block on lookup failure.
    const data = (await res.json()) as {
      Status?: number;
      Answer?: Array<{ type: number }>;
    };
    // NXDOMAIN (3) or no MX answers means the domain can't receive mail.
    if (data.Status === 3) return false;
    if (!data.Answer || data.Answer.length === 0) {
      // Fall back to an A record check — some hosts accept mail on the apex.
      const a = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!a.ok) return true;
      const adata = (await a.json()) as { Status?: number; Answer?: unknown[] };
      return adata.Status === 0 && !!adata.Answer && adata.Answer.length > 0;
    }
    return true;
  } catch {
    return true; // Network hiccup — allow, mail send will surface errors.
  }
}

export const validateEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const parsed = emailSchema.safeParse(data.email);
    if (!parsed.success) {
      return { ok: false as const, error: "Enter a valid email address." };
    }
    const email = parsed.data;
    const domain = email.split("@")[1] ?? "";
    if (!domain || DISPOSABLE_DOMAINS.has(domain)) {
      return { ok: false as const, error: "Please use a real email address." };
    }
    if (!(await domainAcceptsMail(domain))) {
      return { ok: false as const, error: "That email address can't receive mail." };
    }
    return { ok: true as const, email };
  });
