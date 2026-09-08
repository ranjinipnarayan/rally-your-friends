import { renderCard } from "./render.ts";

Deno.test("renders personalized PNGs on cold and warm requests", async () => {
  let previous: Uint8Array | undefined;
  for (const confirmed of [false, true]) {
    const response = await renderCard({
      activity: "Dinner with friends",
      when: "Saturday at 7 PM",
      where: "Cafe in Boston",
      confirmed,
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
      throw new Error("Confirmation must change the image");
    previous = png;
  }
});
