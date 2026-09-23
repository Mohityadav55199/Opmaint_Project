import React from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Archive,
  User,
} from "lucide-react";

export interface DashboardSummary {
  total: number;
  active: number;
  pendingApproval: number;
  draft: number;
  expired: number;
  closed: number;
  closedVerified: number;
  suspended: number;
  cancelled: number;
  rejected: number;
  filtered: number;
  myDrafts: number;
  myActive: number;
  myPendingApprovals: number;
}

interface SummaryCardsProps {
  summary: DashboardSummary;
  activeFilter?: {
    status?: string;
    mine?: boolean;
    myApprovals?: boolean;
  };
  onFilterSelect: (filters: { status?: string; mine?: boolean; myApprovals?: boolean }) => void;
}

export function SummaryCards({
  summary,
  activeFilter,
  onFilterSelect,
}: SummaryCardsProps) {
  const cards = [
    {
      id: "active",
      label: "Active Permits",
      count: summary.active,
      sublabel: "Authorized & ongoing",
      icon: PlayCircle,
      iconColor: "text-emerald-500",
      bgColor: "bg-emerald-50/50 dark:bg-emerald-950/20",
      borderColor: "border-emerald-200 dark:border-emerald-800",
      activeBg: "ring-2 ring-emerald-500",
      filter: { status: "ACTIVE" },
      isActive: activeFilter?.status === "ACTIVE",
    },
    {
      id: "pendingApproval",
      label: "Pending Approval",
      count: summary.pendingApproval,
      sublabel: "Awaiting safety / area sign-off",
      icon: Clock,
      iconColor: "text-amber-500",
      bgColor: "bg-amber-50/50 dark:bg-amber-950/20",
      borderColor: "border-amber-200 dark:border-amber-800",
      activeBg: "ring-2 ring-amber-500",
      filter: { status: "PENDING_APPROVAL" },
      isActive: activeFilter?.status === "PENDING_APPROVAL",
    },
    {
      id: "myApprovals",
      label: "My Pending Approvals",
      count: summary.myPendingApprovals,
      sublabel: "Your direct sign-off obligation",
      icon: CheckCircle2,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-50/50 dark:bg-blue-950/20",
      borderColor: "border-blue-200 dark:border-blue-800",
      activeBg: "ring-2 ring-blue-500",
      filter: { myApprovals: true },
      isActive: activeFilter?.myApprovals === true,
      highlightBadge: summary.myPendingApprovals > 0 ? "Action Required" : undefined,
    },
    {
      id: "myDrafts",
      label: "My Drafts",
      count: summary.myDrafts,
      sublabel: "Editable drafts created by you",
      icon: User,
      iconColor: "text-zinc-500",
      bgColor: "bg-zinc-50 dark:bg-zinc-900",
      borderColor: "border-zinc-200 dark:border-zinc-800",
      activeBg: "ring-2 ring-zinc-500",
      filter: { status: "DRAFT", mine: true },
      isActive: activeFilter?.status === "DRAFT" && activeFilter?.mine === true,
    },
    {
      id: "expired",
      label: "Expired",
      count: summary.expired,
      sublabel: "Validity elapsed without close",
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      bgColor: "bg-rose-50/50 dark:bg-rose-950/20",
      borderColor: "border-rose-200 dark:border-rose-800",
      activeBg: "ring-2 ring-rose-500",
      filter: { status: "EXPIRED" },
      isActive: activeFilter?.status === "EXPIRED",
    },
    {
      id: "closed",
      label: "Closed & Verified",
      count: summary.closed + summary.closedVerified,
      sublabel: "Completed & archived",
      icon: Archive,
      iconColor: "text-indigo-500",
      bgColor: "bg-indigo-50/50 dark:bg-indigo-950/20",
      borderColor: "border-indigo-200 dark:border-indigo-800",
      activeBg: "ring-2 ring-indigo-500",
      filter: { status: "CLOSED" },
      isActive: activeFilter?.status === "CLOSED",
    },
    {
      id: "total",
      label: "Total Permits",
      count: summary.total,
      sublabel: "All records across plant",
      icon: FileText,
      iconColor: "text-zinc-600 dark:text-zinc-400",
      bgColor: "bg-white dark:bg-zinc-900",
      borderColor: "border-zinc-200 dark:border-zinc-800",
      activeBg: "ring-2 ring-zinc-500",
      filter: {},
      isActive:
        !activeFilter?.status && !activeFilter?.mine && !activeFilter?.myApprovals,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onFilterSelect(card.filter)}
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
              card.bgColor
            } ${card.borderColor} ${card.isActive ? card.activeBg : "hover:shadow-sm"}`}
          >
            {card.highlightBadge && (
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500 text-white animate-pulse">
                {card.highlightBadge}
              </span>
            )}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {card.label}
              </span>
              <Icon size={16} className={card.iconColor} />
            </div>
            <div>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                {card.count}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {card.sublabel}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
