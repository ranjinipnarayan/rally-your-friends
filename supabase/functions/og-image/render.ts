import { ImageResponse } from "@vercel/og";
import { createElement, type ReactNode } from "react";
import { ogCardTree, type OgCardData } from "./og-card.ts";

type ElementTree = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};

function element(value: unknown): ReactNode {
  if (typeof value === "string" || typeof value === "number" || value == null)
    return value;
  if (Array.isArray(value)) return value.map(element);
  const {
    type,
    props: { children, ...props },
  } = value as ElementTree;
  return createElement(
    type,
    props,
    ...(Array.isArray(children) ? children.map(element) : [element(children)]),
  );
}

let fontsPromise:
  | Promise<
      { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]
    >
  | undefined;

export async function renderCard(card: OgCardData): Promise<Response> {
  fontsPromise ??= Promise.all([
    Deno.readFile(new URL("./assets/Inter-Regular.ttf", import.meta.url)),
    Deno.readFile(new URL("./assets/Inter-Bold.ttf", import.meta.url)),
  ])
    .then(([regular, bold]) => [
      {
        name: "Inter",
        data: regular.buffer as ArrayBuffer,
        weight: 400 as const,
        style: "normal" as const,
      },
      {
        name: "Inter",
        data: bold.buffer as ArrayBuffer,
        weight: 700 as const,
        style: "normal" as const,
      },
    ])
    .catch((error: unknown) => {
      fontsPromise = undefined;
      throw error;
    });
  const rendered = new ImageResponse(element(ogCardTree(card)), {
    width: 1200,
    height: 630,
    fonts: await fontsPromise,
  });
  // Materialize here so render failures are caught by the handler.
  return new Response(await rendered.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
