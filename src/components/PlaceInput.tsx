import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { suggestPlaces, type PlaceSuggestion } from "@/lib/places.functions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
};

/** Text input with Google Places suggestions as you type. */
export function PlaceInput({
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
}: Props) {
  const lookup = useServerFn(suggestPlaces);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const picked = useRef(false);
  const typed = useRef(false);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      lookup({ data: { query: q } })
        .then((res) => {
          if (!active) return;
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
        type="text"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
          setOpen(true);
        }}

        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border border-border px-3 py-2 text-base"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full border border-border bg-background">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  picked.current = true;
                  onChange(
                    s.secondary ? `${s.label}, ${s.secondary}` : s.label,
                  );
                  setSuggestions([]);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{s.label}</span>
                {s.secondary && (
                  <span className="block text-xs text-muted-foreground">
                    {s.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
          <li
            translate="no"
            className="border-t border-border px-3 py-2 text-right font-sans text-xs font-normal not-italic tracking-normal whitespace-nowrap text-[#5e5e5e]"
          >
            Google Maps
          </li>
        </ul>
      )}
    </div>
  );
}
