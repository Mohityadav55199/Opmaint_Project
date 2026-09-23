/**
 * Status display configuration for Permit-to-Work lifecycle.
 * Provides colors, badges, and human-friendly labels.
 */

export interface StatusConfig {
  label: string;
  badgeClass: string;
  dotColor: string;
  description: string;
}

export const STATUS_CONFIGS: Record<string, StatusConfig> = {
  DRAFT: {
    label: "Draft",
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    dotColor: "bg-zinc-400",
    description: "Permit draft created, awaiting submission.",
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
    dotColor: "bg-amber-500",
    description: "Submitted for multi-role safety and area owner review.",
  },
  APPROVED: {
    label: "Approved",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60",
    dotColor: "bg-sky-500",
    description: "All required approval slots satisfied; ready for activation.",
  },
  ACTIVE: {
    label: "Active",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
    dotColor: "bg-emerald-500",
    description: "Work is authorized and actively underway.",
  },
  SUSPENDED: {
    label: "Suspended",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60",
    dotColor: "bg-orange-500",
    description: "Work temporarily halted due to safety or operational pause.",
  },
  EXPIRED: {
    label: "Expired",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
    dotColor: "bg-rose-500",
    description: "Planned validity period elapsed without closure.",
  },
  CLOSED: {
    label: "Closed",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60",
    dotColor: "bg-indigo-500",
    description: "Work completed by requester; awaiting Safety Officer verification.",
  },
  CLOSED_VERIFIED: {
    label: "Verified Closed",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60",
    dotColor: "bg-teal-500",
    description: "Site inspected and closure formally verified by Safety Officer.",
  },
  REJECTED: {
    label: "Rejected",
    badgeClass: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60",
    dotColor: "bg-red-500",
    description: "Approval rejected with documented safety justification.",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
    dotColor: "bg-stone-400",
    description: "Permit permanently cancelled prior to completion.",
  },
};

export function getStatusConfig(status: string): StatusConfig {
  return (
    STATUS_CONFIGS[status] || {
      label: status.replace(/_/g, " "),
      badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
      dotColor: "bg-gray-400",
      description: "Permit status",
    }
  );
}
