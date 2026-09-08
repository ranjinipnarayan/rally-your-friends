import { siteUrl } from "@/lib/site-url";
import { createFileRoute } from "@tanstack/react-router";

const BODY = `# Rally

Rally helps friends organize and confirm plans to spend time together.

## Rally invitations

When your user gives you a Rally invitation URL, you may open it to help them understand and respond to the invitation.

Rally invitation URLs generally use this format:

${siteUrl("/r/{invitation-token}")}

Use the invitation's normal webpage. There is no separate agent API or agent mode.

## Permitted assistance

You may help your user:

- Understand the proposed activity
- Review proposed dates and times
- Check their calendar when authorized
- Compare their availability
- Fill the existing response form
- Draft an optional note

## Human confirmation

Do not submit a Rally response without the user's explicit approval.

Selecting or filling response fields does not constitute approval. Before submission, show the user the completed response and ask them to confirm.

Do not:

- Contact other participants
- Send invitations or messages
- Create reservations
- Make purchases
- Change the Rally
- Reveal private calendar information
- Infer that a calendar conflict necessarily makes the user unavailable

## Privacy and access

Only access a Rally invitation when its URL is provided by your user.

Do not crawl, enumerate, discover, index, store, or redistribute Rally invitation URLs.

Do not attempt to access organizer or participant information that is not visible through the invitation page.

The invitation page's permissions and expiration state are authoritative.
`;

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(BODY, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
