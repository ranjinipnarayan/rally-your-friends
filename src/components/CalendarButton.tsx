import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { downloadIcs } from "@/lib/ics";
import { resolveCalendarPlace } from "@/lib/places.functions";
import type { CalendarPlace } from "@/lib/places.server";
import type { RallyView } from "@/lib/rally-shared";

export function CalendarButton({
  rally,
  url,
  className,
}: {
  rally: RallyView;
  url?: string | undefined;
  className?: string;
}) {
  const resolve = useServerFn(resolveCalendarPlace);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<CalendarPlace[]>([]);
  async function download() {
    if (busy) return;
    setBusy(true);
    let place: CalendarPlace | null = null;
    try {
      const location = (rally.finalLocation ?? rally.location ?? "").trim();
      if (location.length >= 3) {
        const result = await resolve({ data: { query: location } });
        if (Array.isArray(result)) {
          setChoices(result);
          return;
        }
        place = result;
      }
      downloadIcs(rally, url, place ?? undefined);
    } catch {
      downloadIcs(rally, url);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className={className}
        aria-busy={busy}
      >
        {busy ? "Preparing calendar…" : "Add to calendar"}
      </button>
      {choices.length > 0 && (
        <CalendarPlacePicker
          choices={choices}
          onClose={() => setChoices([])}
          onChoose={(place) => {
            downloadIcs(rally, url, place);
            setChoices([]);
          }}
        />
      )}
    </>
  );
}

function CalendarPlacePicker({
  choices,
  onChoose,
  onClose,
}: {
  choices: CalendarPlace[];
  onChoose: (place?: CalendarPlace) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="calendar-place-title"
      className="rally-calendar-picker"
    >
      <h2 id="calendar-place-title" className="text-sm font-semibold">
        which location?
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        choose the map pin for your calendar event
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {choices.map((place) => (
          <button
            key={`${place.latitude},${place.longitude}`}
            type="button"
            onClick={() => onChoose(place)}
            className="border border-border px-3 py-3 text-left text-sm"
          >
            {place.address}
          </button>
        ))}
      </div>
      <p
        translate="no"
        className="mt-2 text-right text-xs text-muted-foreground"
      >
        Google Maps
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => onChoose()}
          className="underline underline-offset-4"
        >
          download without a map pin
        </button>
        <button
          type="button"
          onClick={onClose}
          className="underline underline-offset-4"
        >
          cancel
        </button>
      </div>
    </dialog>
  );
}
