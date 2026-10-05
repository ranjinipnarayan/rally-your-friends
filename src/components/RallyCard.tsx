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
  onEdit?: (() => void) | undefined;
  children?: ReactNode;
}) {
  const isPoll = rally.timeMode === "poll";
  const confirmedTime = rally.finalTime ?? rally.startsAt;
  const location = rally.finalLocation ?? rally.location ?? "To be decided";

  return (
    <section
      className="relative border border-border p-4"
      aria-label="Plan details"
    >
      <dl className="space-y-2 text-sm">
        <div className={onEdit ? "pr-10" : undefined}>
          <dt className="text-xs tracking-wide text-muted-foreground">Plan</dt>
          <dd className="text-base font-semibold">{rally.activity}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground">Time</dt>
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
          <dt className="text-xs tracking-wide text-muted-foreground">
            Location
          </dt>
          <dd>
            {location}
            {rally.mapsUrl && (
              <a
                href={rally.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block underline"
              >
                Open in Google Maps
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground">
            Time zone
          </dt>
          <dd>{currentTimeZone()}</dd>
        </div>
        {rally.responsesOpen && (
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground">
              Respond by
            </dt>
            <dd>
              <TimeStamp value={rally.expiresAt} />
            </dd>
          </div>
        )}
      </dl>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="plan-card-edit absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={editing ? "Save changes" : "Edit plan"}
          title={editing ? "save changes" : "edit plan"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {editing ? (
              <>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" />
                <path d="M7 3v6h10V3M7 21v-8h10v8" />
              </>
            ) : (
              <>
                <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" />
                <path d="m13 6 5 5" />
              </>
            )}
          </svg>
        </button>
      )}

      {editing && children && (
        <div className="mt-4 border-t border-border pt-4">{children}</div>
      )}
    </section>
  );
}
