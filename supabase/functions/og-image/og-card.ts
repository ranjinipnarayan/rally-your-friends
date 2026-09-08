/** Shared shape + layout for the dynamic share image. */
export type OgCardData = {
  activity: string;
  when: string;
  where: string;
  confirmed: boolean;
};

const BLACK = "#000000";
const WHITE = "#ffffff";
const GREY = "#6b6b6b";

function truncate(value: string, max: number) {
  const v = value.trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** A satori element tree (plain objects; no JSX needed). */
export function ogCardTree(data: OgCardData) {
  const row = (label: string, value: string) => ({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "baseline", gap: 24 },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontSize: 24,
              letterSpacing: 3,
              color: GREY,
              width: 140,
              textTransform: "uppercase",
            },
            children: label,
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 40, color: BLACK },
            children: truncate(value, 42),
          },
        },
      ],
    },
  });

  return {
    type: "div",
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: WHITE,
        border: `10px solid ${BLACK}`,
        padding: "56px 64px",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 30,
                    fontWeight: 700,
                    letterSpacing: 8,
                    color: BLACK,
                  },
                  children: "RALLY",
                },
              },
              ...(data.confirmed
                ? [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 22,
                          letterSpacing: 3,
                          color: WHITE,
                          backgroundColor: BLACK,
                          padding: "8px 18px",
                        },
                        children: "CONFIRMED",
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 28 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 84,
                    fontWeight: 700,
                    color: BLACK,
                    lineHeight: 1.05,
                  },
                  children: truncate(data.activity, 34),
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", gap: 14 },
                  children: [row("When", data.when), row("Where", data.where)],
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 26, color: GREY },
            children: "Tap to say if this works for you",
          },
        },
      ],
    },
  };
}
