import { useEffect, useRef } from "react";

export function RallyFinish() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wave = useRef<(() => void) | null>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    if (import.meta.env.SSR) return;
    const element = canvas.current;
    if (!element) return;
    void import("./rally-flag")
      .then(({ mountFlag }) => {
        if (disposed) return;
        const flag = mountFlag(element);
        wave.current = flag?.wave ?? null;
        cleanup = flag?.dispose;
      })
      .catch(() => {
        /* Keep the static flag if WebGL is unavailable. */
      });
    return () => {
      disposed = true;
      wave.current = null;
      cleanup?.();
    };
  }, []);
  return (
    <span
      className="rally-finish"
      aria-hidden="true"
      onPointerEnter={() => wave.current?.()}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M5 21V3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6 4h14v10H6z"
          fill="white"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M6 4h3.5v3.3H6zm7 0h3.5v3.3H13zm-3.5 3.3H13v3.4H9.5zm7 0H20v3.4h-3.5zM6 10.7h3.5V14H6zm7 0h3.5V14H13z"
          fill="currentColor"
        />
      </svg>
      <canvas ref={canvas} />
    </span>
  );
}
