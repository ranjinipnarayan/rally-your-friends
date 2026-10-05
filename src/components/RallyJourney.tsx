import { useLayoutEffect, useRef } from "react";

/** A decorative car follows the active form section without repeating labels. */
export function RallyJourney({ step }: { step: number }) {
  const track = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const car = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const rail = track.current;
    const icon = car.current;
    const form = rail?.closest("form");
    if (!rail || !icon || !form) return;
    function position() {
      const fieldsets = form?.querySelectorAll("fieldset");
      if (!fieldsets || !rail || !icon) return;
      const railTop = rail.getBoundingClientRect().top;
      fieldsets.forEach((fieldset, index) => {
        const bounds = fieldset.getBoundingClientRect();
        const target = bounds.top - railTop + bounds.height / 2;
        const dot = dots.current[index];
        if (dot) dot.style.top = `${target}px`;
        if (index === step) icon.style.top = `${target}px`;
      });
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(form);
    return () => observer.disconnect();
  }, [step]);
  return (
    <div ref={track} className="rally-side-track" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          ref={(element) => {
            dots.current[index] = element;
          }}
          className={`rally-side-stop${index === step ? " is-current" : ""}`}
        />
      ))}
      <svg ref={car} className="rally-side-car" viewBox="0 0 80 40" fill="none">
        <path
          d="M5 29V19l8-10-3-3 19-4h17l13 7 9 6 9 4 2 10H5Z"
          fill="#101112"
        />
        <path
          d="m20 10 7-3v8l-11-2 4-3Zm11-3h11l1 9-12-1V7Zm16 0 10 5 8 5-17-1-1-9Z"
          fill="white"
        />
        <path d="m6 18 3-4 2 5H6Z" fill="#d92828" />
        <circle cx="20" cy="29" r="8" fill="#101112" />
        <circle cx="64" cy="29" r="8" fill="#101112" />
      </svg>
    </div>
  );
}
