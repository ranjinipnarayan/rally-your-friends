const TOKEN_RE = /^[a-z0-9]{16,64}$/;

export async function proxyOgImage(
  request: Request,
  token: string,
  options: {
    supabaseUrl: string | undefined;
    secret: string | undefined;
    fetcher?: typeof fetch;
    cache?: Pick<Cache, "match" | "put"> | undefined;
  },
): Promise<Response> {
  const fallback = () =>
    new Response(null, {
      status: 302,
      headers: {
        Location: new URL("/og.png", request.url).href,
        "Cache-Control": "no-store",
      },
    });
  if (!TOKEN_RE.test(token) || !options.supabaseUrl || !options.secret)
    return fallback();
  const cacheUrl = new URL(`/api/public/og/${token}`, request.url);
  const version = new URL(request.url).searchParams.get("v");
  if (version && /^[a-zA-Z0-9]{1,16}$/.test(version))
    cacheUrl.searchParams.set("v", version);
  const cacheKey = new Request(cacheUrl);
  try {
    const cached = await options.cache?.match(cacheKey);
    if (cached) return cached;
  } catch {
    /* A cache outage must not prevent rendering. */
  }
  try {
    // Only the validated token is forwarded. No caller-supplied URL or headers.
    const endpoint = new URL(
      `${options.supabaseUrl.replace(/\/$/, "")}/functions/v1/og-image`,
    );
    endpoint.searchParams.set("token", token);
    const response = await (options.fetcher ?? fetch)(endpoint, {
      headers: { "X-Rally-Render-Secret": options.secret },
      signal: AbortSignal.timeout(10000),
      redirect: "manual",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      return fallback();
    // Consume inside the timeout/error boundary, so interrupted renders fall back.
    const png = await response.arrayBuffer();
    const signature = new Uint8Array(png, 0, Math.min(png.byteLength, 8));
    if ([137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => signature[i] !== b))
      return fallback();
    const result = new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
    try {
      await options.cache?.put(cacheKey, result.clone());
    } catch {
      /* Serve uncached. */
    }
    return result;
  } catch (error) {
    console.error("Share image renderer unavailable", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error
        ? error.message.replace(/https?:\/\/\S+/g, "[url]")
        : "Unknown error",
    });
    return fallback();
  }
}
