import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode, command }) => {
  // Local server settings only. Vite exposes only VITE_ settings to the browser.
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_MAPS_API_KEY",
    "OG_RENDER_SECRET",
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  if (command === "build") {
    for (const key of [
      "VITE_SITE_URL",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]) {
      if (!(process.env[key] || env[key]))
        throw new Error(`Missing build setting: ${key}`);
    }
    const publicKey =
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
      env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
    let role: unknown;
    try {
      role = JSON.parse(
        Buffer.from(publicKey.split(".")[1] ?? "", "base64url").toString(),
      ).role;
    } catch {
      /* Opaque publishable keys are not JWTs. */
    }
    if (publicKey.startsWith("sb_secret_") || role === "service_role") {
      throw new Error(
        "VITE_SUPABASE_PUBLISHABLE_KEY must be a public key, never a service-role or secret key",
      );
    }
    const site = new URL(process.env["VITE_SITE_URL"] || env["VITE_SITE_URL"]!);
    if (
      !["http:", "https:"].includes(site.protocol) ||
      site.pathname !== "/" ||
      site.search ||
      site.hash ||
      site.username ||
      site.password
    ) {
      throw new Error(
        "VITE_SITE_URL must be an HTTP(S) origin without a path, query, or credentials",
      );
    }
  }
  return {
    plugins: [
      tailwindcss(),
      tanstackStart({ server: { entry: "server" } }),
      nitro({
        preset: "cloudflare_pages",
        output: { dir: "dist", publicDir: "dist" },
      }),
      react(),
    ],
    resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  };
});
