import { useState, type ReactNode } from "react";

/** A decorative lap on arrival and hover; no input or card content is covered. */
export function PlanCardLap({ children }: { children: ReactNode }) {
  const [lap, setLap] = useState(0);
  return (
    <div
      className="plan-card-lap"
      onPointerEnter={() => setLap((value) => value + 1)}
    >
      {children}
      <div className="plan-card-track" aria-hidden="true">
        <svg
          key={lap}
          className="plan-card-car"
          viewBox="0 0 80 40"
          fill="none"
        >
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
    </div>
  );
}
