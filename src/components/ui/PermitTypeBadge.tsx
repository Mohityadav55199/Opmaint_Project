import React from "react";
import { Flame, Box, ShieldAlert, Zap, FileText } from "lucide-react";
import { formatPermitType } from "@/lib/utils/formatters";

interface PermitTypeBadgeProps {
  type: string;
  size?: "sm" | "md";
  className?: string;
  showIcon?: boolean;
}

export function PermitTypeBadge({
  type,
  size = "md",
  className = "",
  showIcon = true,
}: PermitTypeBadgeProps) {
  const iconSize = size === "sm" ? 12 : 14;

  const renderIcon = () => {
    switch (type) {
      case "HOT_WORK":
        return <Flame size={iconSize} className="text-orange-500" />;
      case "CONFINED_SPACE_ENTRY":
        return <Box size={iconSize} className="text-purple-500" />;
      case "WORKING_AT_HEIGHT":
        return <ShieldAlert size={iconSize} className="text-blue-500" />;
      case "ELECTRICAL_ISOLATION_LOTO":
        return <Zap size={iconSize} className="text-amber-500" />;
      default:
        return <FileText size={iconSize} className="text-zinc-500" />;
    }
  };

  const badgeColor = () => {
    switch (type) {
      case "HOT_WORK":
        return "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/50";
      case "CONFINED_SPACE_ENTRY":
        return "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/50";
      case "WORKING_AT_HEIGHT":
        return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/50";
      case "ELECTRICAL_ISOLATION_LOTO":
        return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50";
      default:
        return "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs font-medium",
    md: "px-2.5 py-0.5 text-xs font-semibold",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border ${badgeColor()} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && renderIcon()}
      <span>{formatPermitType(type)}</span>
    </span>
  );
}
