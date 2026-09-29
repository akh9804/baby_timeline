import type { Child } from "@/entities/types";
// Family calendar dates are always interpreted in Korea, regardless of viewer timezone.
export function calendarDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function ageLabel(
  occurredAt: string,
  child: Pick<Child, "birth_date" | "due_date">,
) {
  const event = Date.parse(calendarDate(occurredAt));
  if (child.birth_date && event >= Date.parse(child.birth_date))
    return `D+${Math.round((event - Date.parse(child.birth_date)) / 86400000)}`;
  if (child.due_date) {
    const days =
      280 + Math.round((event - Date.parse(child.due_date)) / 86400000);
    if (days >= 0) return `임신 ${Math.floor(days / 7)}주 ${days % 7}일`;
  }
  return "소중한 하루";
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}
export function toLocalInput(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
