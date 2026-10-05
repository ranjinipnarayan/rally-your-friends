/** Shared shape + layout for the dynamic share image. */
export type OgCardData = {
  activity: string;
  when: string;
  where: string;
  status: "open" | "confirmed" | "cancelled" | "completed";
  responsesOpen: boolean;
};

const INK = "#080d1b";
const RED = "#df242b";
const MUTED = "#61728a";

function truncate(value: string, max: number) {
  const v = value.trim().toLowerCase();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function finishFlag() {
  return {
    type: "svg",
    props: {
      width: 38,
      height: 38,
      viewBox: "0 0 24 24",
      children: [
        {
          type: "path",
          props: { d: "M4 3v19", stroke: INK, strokeWidth: 1.7 },
        },
        {
          type: "path",
          props: {
            d: "M5 3h15v12H5z",
            fill: "white",
            stroke: INK,
            strokeWidth: 1.4,
          },
        },
        ...[
          [5, 3],
          [15, 3],
          [10, 7],
          [5, 11],
          [15, 11],
        ].map(([x, y]) => ({
          type: "rect",
          props: { x, y, width: 5, height: 4, fill: INK },
        })),
      ],
    },
  };
}

/** A satori element tree (plain objects; no JSX needed). */
export function ogCardTree(data: OgCardData) {
  const status =
    data.status === "confirmed"
      ? ""
      : data.status === "cancelled"
        ? "rally cancelled"
        : data.status === "completed"
          ? "rally complete"
          : data.responsesOpen
            ? "you’re invited"
            : "rsvps are closed";
  const footer =
    data.status === "confirmed"
      ? "tap to rsvp + add to your calendar →"
      : data.status === "cancelled"
        ? "the organizer cancelled this rally"
        : data.status === "completed"
          ? "this event has passed"
          : data.responsesOpen
            ? "tap to rsvp + add to your calendar →"
            : "tap for the latest plan →";
  const row = (label: string, value: string) => ({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "baseline", gap: 24 },
      children: [
        {
          type: "div",
          props: {
            style: { fontSize: 25, color: MUTED, width: 95 },
            children: label,
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 34, color: INK },
            children: truncate(value, 48),
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
        padding: 30,
        backgroundColor: "#f1f5f9",
        fontFamily: "Inter",
      },
      children: {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            backgroundColor: "#ffffff",
            border: `2px solid ${RED}`,
            borderRadius: 26,
            padding: "40px 48px",
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
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        fontSize: 34,
                        fontWeight: 700,
                        color: INK,
                      },
                      children: ["rally", finishFlag()],
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 24, color: MUTED },
                      children: status,
                    },
                  },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 24 },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        fontSize: 72,
                        fontWeight: 700,
                        color: INK,
                        lineHeight: 1.08,
                      },
                      children: truncate(data.activity, 48),
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      },
                      children: [
                        row("when", data.when),
                        row("where", data.where),
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        borderRadius: 12,
                        padding: "18px 24px",
                        fontSize: 32,
                        fontWeight: 700,
                        color:
                          data.status === "confirmed" || data.responsesOpen
                            ? "#ffffff"
                            : MUTED,
                        backgroundColor:
                          data.status === "confirmed" || data.responsesOpen
                            ? RED
                            : "#f1f5f9",
                      },
                      children: footer,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };
}
