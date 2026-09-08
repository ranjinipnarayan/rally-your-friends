import { formatFullDateTime, isoWithOffset } from "@/lib/rally-shared";

/**
 * Renders a complete, unambiguous timestamp: a semantic <time> element whose
 * datetime attribute carries the full ISO-8601 value including the UTC offset,
 * and whose visible text spells out the date, local time and timezone.
 */
export function TimeStamp({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const iso = isoWithOffset(value);
  if (!iso) return <span className={className}>To be decided</span>;
  return (
    <time dateTime={iso} className={className}>
      {formatFullDateTime(value)}
    </time>
  );
}
