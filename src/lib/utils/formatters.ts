/**
 * Utility functions for formatting dates, durations, and domain enums.
 */

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatTimeRemaining(targetDate: Date | string | null | undefined): {
  text: string;
  isPast: boolean;
  isWarning: boolean;
} {
  if (!targetDate) return { text: "No expiry set", isPast: false, isWarning: false };
  const d = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  if (isNaN(d.getTime())) return { text: "Invalid date", isPast: false, isWarning: false };

  const now = Date.now();
  const diffMs = d.getTime() - now;

  if (diffMs <= 0) {
    const elapsedMinutes = Math.abs(Math.floor(diffMs / (1000 * 60)));
    if (elapsedMinutes < 60) {
      return { text: `Expired ${elapsedMinutes}m ago`, isPast: true, isWarning: false };
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return { text: `Expired ${elapsedHours}h ago`, isPast: true, isWarning: false };
  }

  const remainingMinutes = Math.floor(diffMs / (1000 * 60));
  const remainingHours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  const isWarning = remainingMinutes <= 120; // 2 hours or less

  if (remainingHours === 0) {
    return { text: `${minutes}m remaining`, isPast: false, isWarning };
  }
  return { text: `${remainingHours}h ${minutes}m remaining`, isPast: false, isWarning };
}

export function formatPermitType(type: string): string {
  switch (type) {
    case "HOT_WORK":
      return "Hot Work";
    case "CONFINED_SPACE_ENTRY":
      return "Confined Space Entry";
    case "WORKING_AT_HEIGHT":
      return "Working at Height";
    case "ELECTRICAL_ISOLATION_LOTO":
      return "Electrical Isolation & LOTO";
    default:
      return type.replace(/_/g, " ");
  }
}

export function formatRole(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Plant Administrator";
    case "SAFETY_OFFICER":
      return "Safety Officer";
    case "AREA_OWNER":
      return "Area Owner";
    case "REQUESTER":
      return "Permit Requester";
    default:
      return role.replace(/_/g, " ");
  }
}
