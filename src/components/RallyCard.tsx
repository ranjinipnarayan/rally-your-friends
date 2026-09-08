import type { ReactNode } from "react";

import { TimeStamp } from "@/components/TimeStamp";
import { currentTimeZone, type RallyView } from "@/lib/rally-shared";

export function RallyCard({
  rally,
  editing,
  onEdit,
  children,
}: {
  rally: RallyView;
  editing?: boolean;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  const isPoll = rally.timeMode === "poll";
  const confirmedTime = rally.finalTime ?? rally.startsAt;
  const location = rally.finalLocation ?? rally.location ?? "To be decided";

  return (
    <section className="border border-border p-4" aria-label="Plan details">
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Plan</dt>
          <dd className="text-base font-semibold">{rally.activity}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Time</dt>
          <dd>
            {confirmedTime ? (
              <TimeStamp value={confirmedTime} />
            ) : isPoll && rally.candidates.length > 0 ? (
              <ul className="space-y-1">
                {rally.candidates.map((c) => (
                  <li key={c.id}>
                    <TimeStamp value={c.startsAt} />
                  </li>
                ))}
              </ul>
            ) : (
              "To be decided"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
          <dd>{location}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Time zone</dt>
          <dd>{currentTimeZone()}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Respond by</dt>
          <dd>
            <TimeStamp value={rally.expiresAt} />
          </dd>
        </div>
      </dl>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="mt-3 border border-border px-3 py-1.5 text-xs"
        >
          {editing ? "Done editing" : "Edit"}
        </button>
      )}

      {editing && children && <div className="mt-4 border-t border-border pt-4">{children}</div>}
    </section>
  );
}
