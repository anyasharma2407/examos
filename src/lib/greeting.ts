/**
 * Time-of-day greeting. Pure so it can be tested without freezing the clock
 * globally; the dashboard passes the server's current hour.
 */
export function greetingFor(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
