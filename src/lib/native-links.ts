// Only private management links opt into the containing app. Recipient URLs
// remain web links. The native target must enable the associated domains too.
export const appAssociation = {
  applinks: {
    details: [
      {
        appIDs: ["NWUMX9X84W.com.example.RallyMessages"],
        components: [
          { "/": "/m/*", "?": { web: "1" }, exclude: true },
          { "/": "/m/*" },
        ],
      },
    ],
  },
};
