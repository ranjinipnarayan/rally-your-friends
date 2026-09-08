import { renderCard } from "./render.ts";
import type { OgCardData } from "./og-card.ts";

Deno.test(
  "renders distinct lifecycle PNGs on cold and warm requests",
  async () => {
    let previous: Uint8Array | undefined;
    const statuses: OgCardData["status"][] = [
      "open",
      "confirmed",
      "cancelled",
      "completed",
    ];
    for (const status of statuses) {
      const response = await renderCard({
        activity: "Dinner with friends",
        when: "Saturday at 7 PM",
        where: "Cafe in Boston",
        status,
        responsesOpen: status === "open",
      });
      const png = new Uint8Array(await response.arrayBuffer());
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (
        response.status !== 200 ||
        !signature.every((byte, i) => png[i] === byte)
      )
        throw new Error("Expected a PNG");
      const header = new DataView(png.buffer);
      if (header.getUint32(16) !== 1200 || header.getUint32(20) !== 630)
        throw new Error("Incorrect image dimensions");
      if (
        previous &&
        png.length === previous.length &&
        png.every((b, i) => b === previous![i])
      )
        throw new Error("Lifecycle changes must update the image");
      previous = png;
    }
  },
);
