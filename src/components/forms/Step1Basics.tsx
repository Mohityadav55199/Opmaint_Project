"use client";

import React from "react";
import { Flame, Box, ShieldAlert, Zap } from "lucide-react";
import { SupportedPermitType } from "@/lib/permit-schemas";

export interface Step1Data {
  type: SupportedPermitType;
  contractorTeam: string;
  workDescription: string;
  plannedStartTime: string;
  plannedEndTime: string;
}

interface Step1BasicsProps {
  data: Step1Data;
  onChange: (patch: Partial<Step1Data>) => void;
  onNext: () => void;
  errors?: Record<string, string>;
}

export function Step1Basics({
  data,
  onChange,
  onNext,
  errors = {},
}: Step1BasicsProps) {
  const permitTypes: {
    key: SupportedPermitType;
    label: string;
    description: string;
    icon: typeof Flame;
    color: string;
  }[] = [
    {
      key: "HOT_WORK",
      label: "Hot Work",
      description: "Welding, grinding, cutting, or open flame producing heat or spark hazards.",
      icon: Flame,
      color: "border-orange-200 bg-orange-50/50 hover:bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20 text-orange-600",
    },
    {
      key: "CONFINED_SPACE_ENTRY",
      label: "Confined Space Entry",
      description: "Entry into enclosed or partially enclosed spaces (tanks, vessels, silos, pits).",
      icon: Box,
      color: "border-purple-200 bg-purple-50/50 hover:bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20 text-purple-600",
    },
    {
      key: "WORKING_AT_HEIGHT",
      label: "Working at Height",
      description: "Work performed at an elevation of 1.8 metres (6 ft) or higher with fall risk.",
      icon: ShieldAlert,
      color: "border-blue-200 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 text-blue-600",
    },
    {
      key: "ELECTRICAL_ISOLATION_LOTO",
      label: "Electrical Isolation & LOTO",
      description: "De-energized work on electrical switchgear, panels, or machinery requiring lock-out.",
      icon: Zap,
      color: "border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 text-amber-600",
    },
  ];

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleNext} className="space-y-6">
      {/* Permit Type Selector */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
          Select Work Permit Classification <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {permitTypes.map((pt) => {
            const Icon = pt.icon;
            const isSelected = data.type === pt.key;
            return (
              <button
                key={pt.key}
                type="button"
                onClick={() => onChange({ type: pt.key })}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  isSelected
                    ? "ring-2 ring-zinc-900 dark:ring-zinc-100 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md"
                    : `${pt.color} text-zinc-900 dark:text-zinc-100`
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg shrink-0 ${
                    isSelected
                      ? "bg-white/10 text-white dark:bg-black/10 dark:text-zinc-900"
                      : "bg-white dark:bg-zinc-900 shadow-2xs"
                  }`}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm leading-tight">{pt.label}</div>
                  <div
                    className={`text-xs mt-1 leading-snug ${
                      isSelected ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {pt.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {errors.type && <p className="text-xs text-red-500 mt-1.5">{errors.type}</p>}
      </div>

      {/* Contractor / Maintenance Team */}
      <div>
        <label
          htmlFor="contractorTeam"
          className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Contractor / Maintenance Execution Team <span className="text-red-500">*</span>
        </label>
        <input
          id="contractorTeam"
          type="text"
          required
          value={data.contractorTeam}
          onChange={(e) => onChange({ contractorTeam: e.target.value })}
          placeholder="e.g. Apex Mechanical Services / Internal Millwright Team A"
          className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        {errors.contractorTeam && (
          <p className="text-xs text-red-500 mt-1">{errors.contractorTeam}</p>
        )}
      </div>

      {/* Work Scope / Description */}
      <div>
        <label
          htmlFor="workDescription"
          className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Detailed Scope of Work & Objectives <span className="text-red-500">*</span>
        </label>
        <textarea
          id="workDescription"
          required
          rows={3}
          value={data.workDescription}
          onChange={(e) => onChange({ workDescription: e.target.value })}
          placeholder="Describe the specific maintenance activity, tools to be used, and boundaries of work (minimum 10 characters)..."
          className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <div className="flex justify-between items-center mt-1">
          {errors.workDescription ? (
            <p className="text-xs text-red-500">{errors.workDescription}</p>
          ) : (
            <span className="text-[11px] text-zinc-400">Minimum 10 characters</span>
          )}
          <span className="text-[11px] text-zinc-400">
            {data.workDescription.length} characters
          </span>
        </div>
      </div>

      {/* Planned Schedule Windows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="plannedStartTime"
            className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Planned Start Time <span className="text-red-500">*</span>
          </label>
          <input
            id="plannedStartTime"
            type="datetime-local"
            required
            value={data.plannedStartTime}
            onChange={(e) => onChange({ plannedStartTime: e.target.value })}
            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          {errors.plannedStartTime && (
            <p className="text-xs text-red-500 mt-1">{errors.plannedStartTime}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="plannedEndTime"
            className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Planned Completion / Expiry Time <span className="text-red-500">*</span>
          </label>
          <input
            id="plannedEndTime"
            type="datetime-local"
            required
            value={data.plannedEndTime}
            onChange={(e) => onChange({ plannedEndTime: e.target.value })}
            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          {errors.plannedEndTime && (
            <p className="text-xs text-red-500 mt-1">{errors.plannedEndTime}</p>
          )}
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold shadow-xs transition-colors"
        >
          Proceed to Location Selection →
        </button>
      </div>
    </form>
  );
}
