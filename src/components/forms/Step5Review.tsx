"use client";

import React from "react";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";
import { formatDateTime, formatPermitType } from "@/lib/utils/formatters";
import { SupportedPermitType } from "@/lib/permit-schemas";
import {
  Calendar,
  Building,
  AlertTriangle,
  Shield,
  FileCheck,
  Save,
  Send,
  Loader2,
} from "lucide-react";

interface Step5ReviewProps {
  formData: {
    type: SupportedPermitType;
    contractorTeam: string;
    workDescription: string;
    plannedStartTime: string;
    plannedEndTime: string;
    equipmentId: string;
    equipmentName?: string;
    equipmentTag?: string;
    areaName?: string;
    plantName?: string;
    typeData: Record<string, unknown>;
    hazards: string[];
    ppeRequired: string[];
    precautionsChecklist: Record<string, boolean>;
  };
  onBack: () => void;
  onSaveDraft: () => Promise<void>;
  onSubmitForApproval: () => Promise<void>;
  isSubmitting: boolean;
  submitError?: string | null;
  isEditMode?: boolean;
}

export function Step5Review({
  formData,
  onBack,
  onSaveDraft,
  onSubmitForApproval,
  isSubmitting,
  submitError,
  isEditMode = false,
}: Step5ReviewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300">
        <FileCheck size={18} className="text-emerald-500 shrink-0" />
        <span>
          Pre-Submission Verification: Please review all parameters carefully. Once submitted for approval, core
          permit fields become locked and cannot be edited.
        </span>
      </div>

      {submitError && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50">
          <strong>Validation or Submission Error:</strong> {submitError}
        </div>
      )}

      {/* Review Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic Info Card */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Permit Classification & Team
            </h4>
            <PermitTypeBadge type={formData.type} />
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Execution Team:</span>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formData.contractorTeam}
              </div>
            </div>

            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Scope of Work:</span>
              <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                {formData.workDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Schedule & Location Card */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
          <div className="pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Location & Schedule
            </h4>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2">
              <Building size={16} className="text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-zinc-500 dark:text-zinc-400">Equipment Location:</span>
                <div className="font-bold text-zinc-900 dark:text-zinc-100">
                  {formData.equipmentName || "Selected Equipment"}{" "}
                  {formData.equipmentTag && `(${formData.equipmentTag})`}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {formData.areaName && `Area: ${formData.areaName}`}
                  {formData.plantName && ` • Plant: ${formData.plantName}`}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Calendar size={16} className="text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-zinc-500 dark:text-zinc-400">Validity Window:</span>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatDateTime(formData.plannedStartTime)}
                </div>
                <div className="text-[11px] text-zinc-500">
                  until {formatDateTime(formData.plannedEndTime)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Hazards & Controls */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
          <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            <AlertTriangle size={15} className="text-amber-500" />
            <span>Hazards ({formData.hazards.length})</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {formData.hazards.map((hazard) => (
              <span
                key={hazard}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50"
              >
                {hazard}
              </span>
            ))}
          </div>
        </div>

        {/* PPE Requirements */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
          <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            <Shield size={15} className="text-blue-500" />
            <span>Mandatory PPE ({formData.ppeRequired.length})</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {formData.ppeRequired.map((ppe) => (
              <span
                key={ppe}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50"
              >
                {ppe}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Type Specific Preview */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-2">
          {formatPermitType(formData.type)} Safety Parameters Preview
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {Object.entries(formData.typeData).map(([key, val]) => (
            <div key={key} className="bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 font-mono capitalize">
                {key.replace(/([A-Z])/g, " $1")}
              </span>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate mt-0.5">
                {Array.isArray(val) ? val.join(", ") : typeof val === "boolean" ? (val ? "Yes / Confirmed" : "No") : String(val)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions Bar */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          ← Back to Safety Setup
        </button>

        <div className="w-full sm:w-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-colors shadow-2xs disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>{isEditMode ? "Save Changes" : "Save as Draft"}</span>
          </button>

          <button
            type="button"
            onClick={onSubmitForApproval}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>Submit for Approval</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
