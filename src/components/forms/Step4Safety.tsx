"use client";

import React, { useState } from "react";
import { Shield, AlertTriangle, Plus } from "lucide-react";

export interface Step4Data {
  hazards: string[];
  ppeRequired: string[];
  precautionsChecklist: Record<string, boolean>;
}

interface Step4SafetyProps {
  data: Step4Data;
  onChange: (patch: Partial<Step4Data>) => void;
  onNext: () => void;
  onBack: () => void;
  errors?: Record<string, string>;
}

const COMMON_HAZARDS = [
  "Flammable Vapor / Gas Accumulation",
  "Sparks, Hot Slag & Heat Radiation",
  "Oxygen Deficiency / Toxic Atmosphere",
  "Fall from Elevation (≥ 1.8m)",
  "Live Electrical Energy / Arc Flash",
  "Rotating / Moving Machinery Parts",
  "High Pressure Steam / Fluid Release",
  "Chemical Splashes / Corrosive Contact",
  "Noise Exposure (> 85 dBA)",
  "Heavy Overhead Loads / Rigging",
];

const COMMON_PPE = [
  "Hard Hat / Industrial Safety Helmet",
  "Steel-Toe Impact Boots",
  "Safety Glasses with Side Shields",
  "Flame-Retardant Antistatic Coveralls",
  "Full Body Harness with Shock Absorber",
  "Calibrated 4-Gas Personal Monitor",
  "Heavy Leather Welding Gauntlets",
  "Class 0 / Class 1 Electrical Insulating Gloves",
  "Hearing Protection (Earplugs / Earmuffs)",
  "Half-Mask Particulate / Vapor Respirator",
];

const MANDATORY_PRECAUTIONS = [
  { id: "toolbox_talk", label: "Pre-job Toolbox Talk conducted with all work party members" },
  { id: "emergency_stop", label: "Emergency response and stop-work procedures reviewed" },
  { id: "area_barricaded", label: "Work perimeter barricaded with caution/danger warning signs" },
  { id: "communications_checked", label: "Two-way communication with plant control room established" },
  { id: "housekeeping_arranged", label: "Proper cleanup and waste disposal plan established" },
];

export function Step4Safety({
  data,
  onChange,
  onNext,
  onBack,
  errors = {},
}: Step4SafetyProps) {
  const [customHazard, setCustomHazard] = useState("");
  const [customPpe, setCustomPpe] = useState("");

  const toggleHazard = (hazard: string) => {
    if (data.hazards.includes(hazard)) {
      onChange({ hazards: data.hazards.filter((h) => h !== hazard) });
    } else {
      onChange({ hazards: [...data.hazards, hazard] });
    }
  };

  const addCustomHazard = (e: React.FormEvent) => {
    e.preventDefault();
    if (customHazard.trim() && !data.hazards.includes(customHazard.trim())) {
      onChange({ hazards: [...data.hazards, customHazard.trim()] });
      setCustomHazard("");
    }
  };

  const togglePpe = (ppe: string) => {
    if (data.ppeRequired.includes(ppe)) {
      onChange({ ppeRequired: data.ppeRequired.filter((p) => p !== ppe) });
    } else {
      onChange({ ppeRequired: [...data.ppeRequired, ppe] });
    }
  };

  const addCustomPpe = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPpe.trim() && !data.ppeRequired.includes(customPpe.trim())) {
      onChange({ ppeRequired: [...data.ppeRequired, customPpe.trim()] });
      setCustomPpe("");
    }
  };

  const togglePrecaution = (id: string, checked: boolean) => {
    onChange({
      precautionsChecklist: {
        ...data.precautionsChecklist,
        [id]: checked,
      },
    });
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleNext} className="space-y-6">
      {/* Hazards Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={17} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Identified Site & Process Hazards <span className="text-red-500">*</span>
            </h3>
          </div>
          <span className="text-[11px] font-bold text-zinc-500">
            {data.hazards.length} selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {COMMON_HAZARDS.map((hazard) => {
            const isChecked = data.hazards.includes(hazard);
            return (
              <label
                key={hazard}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  isChecked
                    ? "border-amber-400 bg-amber-50/70 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleHazard(hazard)}
                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span className="leading-snug">{hazard}</span>
              </label>
            );
          })}
        </div>

        {/* Custom hazard addition */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={customHazard}
            onChange={(e) => setCustomHazard(e.target.value)}
            placeholder="Add custom process/site hazard..."
            className="flex-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="button"
            onClick={addCustomHazard}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-1"
          >
            <Plus size={14} />
            <span>Add Hazard</span>
          </button>
        </div>
        {errors.hazards && <p className="text-xs text-red-500 mt-1">{errors.hazards}</p>}
      </div>

      {/* PPE Section */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-500" size={17} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Personal Protective Equipment (PPE) Required <span className="text-red-500">*</span>
            </h3>
          </div>
          <span className="text-[11px] font-bold text-zinc-500">
            {data.ppeRequired.length} selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {COMMON_PPE.map((ppe) => {
            const isChecked = data.ppeRequired.includes(ppe);
            return (
              <label
                key={ppe}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  isChecked
                    ? "border-blue-400 bg-blue-50/70 text-blue-950 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => togglePpe(ppe)}
                  className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="leading-snug">{ppe}</span>
              </label>
            );
          })}
        </div>

        {/* Custom PPE addition */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={customPpe}
            onChange={(e) => setCustomPpe(e.target.value)}
            placeholder="Add specialized PPE item..."
            className="flex-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="button"
            onClick={addCustomPpe}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-1"
          >
            <Plus size={14} />
            <span>Add PPE</span>
          </button>
        </div>
        {errors.ppeRequired && (
          <p className="text-xs text-red-500 mt-1">{errors.ppeRequired}</p>
        )}
      </div>

      {/* Mandatory Precautions Checklist */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 mb-2">
          General Safety Precautions Verification
        </h3>
        <div className="space-y-2">
          {MANDATORY_PRECAUTIONS.map((prec) => {
            const isChecked = data.precautionsChecklist[prec.id] ?? true;
            return (
              <label
                key={prec.id}
                className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => togglePrecaution(prec.id, e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>{prec.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="pt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          ← Back to Type Specifications
        </button>

        <button
          type="submit"
          disabled={data.hazards.length === 0 || data.ppeRequired.length === 0}
          className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
        >
          Proceed to Final Review →
        </button>
      </div>
    </form>
  );
}
