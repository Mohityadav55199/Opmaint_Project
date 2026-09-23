"use client";

import React from "react";
import { SupportedPermitType } from "@/lib/permit-schemas";
import { Flame, Box, ShieldAlert, Zap, AlertTriangle } from "lucide-react";

interface Step3TypeSpecificProps {
  type: SupportedPermitType;
  typeData: Record<string, unknown>;
  onChange: (typeData: Record<string, unknown>) => void;
  onNext: () => void;
  onBack: () => void;
  errors?: Record<string, string>;
}

export function Step3TypeSpecific({
  type,
  typeData,
  onChange,
  onNext,
  onBack,
  errors = {},
}: Step3TypeSpecificProps) {
  const updateField = (name: string, value: unknown) => {
    onChange({
      ...typeData,
      [name]: value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300">
        <AlertTriangle size={16} className="text-amber-500 shrink-0" />
        <span>
          Compliance Notice: Type-specific safety parameters are enforced according to industrial safety
          regulations and validated by the backend schema registry.
        </span>
      </div>

      {/* HOT WORK */}
      {type === "HOT_WORK" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <Flame className="text-orange-500" size={18} />
            <span>Hot Work Safety Parameters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Type of Hot Work <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={(typeData.hotWorkType as string) || "WELDING"}
                onChange={(e) => updateField("hotWorkType", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="WELDING">Welding (Arc / TIG / MIG / Gas)</option>
                <option value="GRINDING">Grinding / Abrasive Wheel</option>
                <option value="CUTTING">Thermal Cutting / Oxy-Acetylene</option>
                <option value="SOLDERING">Soldering / Open Flame Heating</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Fire Watch Attendant Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.fireWatchName as string) || ""}
                onChange={(e) => updateField("fireWatchName", e.target.value)}
                placeholder="Name of certified fire watch attendant"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Extinguisher Type Stationed <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.fireExtinguisherType as string) || "DCP 6kg + CO2 4.5kg"}
                onChange={(e) => updateField("fireExtinguisherType", e.target.value)}
                placeholder="e.g. Dry Chemical Powder, CO2, Foam"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Combustibles Cleared Radius (Metres) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={5}
                max={100}
                value={(typeData.combustiblesClearedRadiusMetres as number) || 10}
                onChange={(e) => updateField("combustiblesClearedRadiusMetres", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <span className="text-[11px] text-zinc-400">Standard requirement: minimum 5m</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: LEL % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                step="0.1"
                value={typeData.gasTestLelPercent !== undefined ? (typeData.gasTestLelPercent as number) : 0}
                onChange={(e) => updateField("gasTestLelPercent", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <span className="text-[11px] text-zinc-400">Must be 0% for hot work</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: Oxygen (O2 %) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                step="0.1"
                value={(typeData.gasTestO2Percent as number) || 20.9}
                onChange={(e) => updateField("gasTestO2Percent", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <span className="text-[11px] text-zinc-400">Normal atmospheric baseline: 20.9%</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={(typeData.gasTestTime as string) || new Date().toISOString().slice(0, 16)}
                onChange={(e) => updateField("gasTestTime", new Date(e.target.value).toISOString())}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Authorized Gas Tester Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.gasTesterName as string) || "Rajesh Kulkarni (Safety)"}
                onChange={(e) => updateField("gasTesterName", e.target.value)}
                placeholder="Certified gas tester name"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* CONFINED SPACE */}
      {type === "CONFINED_SPACE_ENTRY" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <Box className="text-purple-500" size={18} />
            <span>Confined Space Entry Specifications</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Confined Space ID / Vessel Tag <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.spaceId as string) || ""}
                onChange={(e) => updateField("spaceId", e.target.value)}
                placeholder="e.g. TANK-TK-101, SILO-S-04"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Entry Point / Manway Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.entryPoint as string) || "Top Manway MW-1"}
                onChange={(e) => updateField("entryPoint", e.target.value)}
                placeholder="e.g. Side Inspection Door, Top Manway"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Standby Attendant Name (Safety Guard) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.standbyAttendantName as string) || ""}
                onChange={(e) => updateField("standbyAttendantName", e.target.value)}
                placeholder="Stationed attendant maintaining entry/exit log"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Ventilation Method <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={(typeData.ventilationMethod as string) || "FORCED_MECHANICAL"}
                onChange={(e) => updateField("ventilationMethod", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="FORCED_MECHANICAL">Forced Mechanical Air Blower</option>
                <option value="NATURAL_DRAFT">Natural Draft (Cross-ventilation)</option>
                <option value="CONTINUOUS_AIR_MOVER">Continuous Pneumatic Air Mover</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Emergency Retrieval & Rescue Plan <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={(typeData.rescuePlanDescription as string) || "Tripod winch mounted over manhole; harness worn; direct radio comms with plant fire team."}
                onChange={(e) => updateField("rescuePlanDescription", e.target.value)}
                placeholder="Describe tripod winch, retrieval lines, and emergency contact procedure..."
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: Oxygen (O2 %) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                step="0.1"
                value={(typeData.gasTestO2Percent as number) || 20.9}
                onChange={(e) => updateField("gasTestO2Percent", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: LEL % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                step="0.1"
                value={typeData.gasTestLelPercent !== undefined ? (typeData.gasTestLelPercent as number) : 0}
                onChange={(e) => updateField("gasTestLelPercent", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: H2S (ppm) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.1"
                value={typeData.gasTestH2sPpm !== undefined ? (typeData.gasTestH2sPpm as number) : 0}
                onChange={(e) => updateField("gasTestH2sPpm", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Test: Carbon Monoxide (CO ppm) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.1"
                value={typeData.gasTestCoPpm !== undefined ? (typeData.gasTestCoPpm as number) : 0}
                onChange={(e) => updateField("gasTestCoPpm", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Atmospheric Tester Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.gasTesterName as string) || "Rajesh Kulkarni"}
                onChange={(e) => updateField("gasTesterName", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Communication Method <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.communicationMethod as string) || "Two-Way UHF Intrinsically Safe Radio"}
                onChange={(e) => updateField("communicationMethod", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* WORKING AT HEIGHT */}
      {type === "WORKING_AT_HEIGHT" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <ShieldAlert className="text-blue-500" size={18} />
            <span>Working at Height Safety Parameters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Working Elevation (Metres) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1.8}
                max={150}
                step="0.1"
                value={(typeData.heightMetres as number) || 4.5}
                onChange={(e) => updateField("heightMetres", Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <span className="text-[11px] text-zinc-400">Permit applies to elevations &ge; 1.8m</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Access Method <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={(typeData.accessMethod as string) || "SCAFFOLD"}
                onChange={(e) => updateField("accessMethod", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="SCAFFOLD">Scaffolding (Green Tagged)</option>
                <option value="MEWP">Mobile Elevating Work Platform (Scissor/Boom)</option>
                <option value="LADDER">Heavy-Duty Industrial Ladder</option>
                <option value="ROPE_ACCESS">Certified Industrial Rope Access</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Fall Arrest Equipment Specification <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.fallArrestEquipment as string) || "EN 361 Full Body Harness with Twin Shock-Absorbing Lanyards"}
                onChange={(e) => updateField("fallArrestEquipment", e.target.value)}
                placeholder="e.g. Full body harness with shock absorber, self-retracting lifeline"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Suspension Trauma Rescue Procedure <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.rescuePlanAtHeight as string) || "Dedicated rescue pole with rope kit and ground rescue team on standby."}
                onChange={(e) => updateField("rescuePlanAtHeight", e.target.value)}
                placeholder="Emergency plan to retrieve fallen worker within 10 minutes"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div className="space-y-2 md:col-span-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  required
                  checked={(typeData.anchorPointChecked as boolean) ?? true}
                  onChange={(e) => updateField("anchorPointChecked", e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>
                  I confirm the certified anchor point (min 15 kN) has been inspected and verified safe prior to work.
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  required
                  checked={(typeData.barricadingBelow as boolean) ?? true}
                  onChange={(e) => updateField("barricadingBelow", e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>
                  I confirm ground barricading and danger signage have been established below the work zone.
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={(typeData.weatherCheckConfirmed as boolean) ?? true}
                  onChange={(e) => updateField("weatherCheckConfirmed", e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>Wind speed and weather conditions checked and suitable (&lt; 25 km/h, no lightning/rain).</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ELECTRICAL LOTO */}
      {type === "ELECTRICAL_ISOLATION_LOTO" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <Zap className="text-amber-500" size={18} />
            <span>Electrical Isolation & LOTO Parameters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Equipment / Switchgear Tag <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.equipmentTag as string) || "MCC-04-FEEDER-02"}
                onChange={(e) => updateField("equipmentTag", e.target.value)}
                placeholder="e.g. MCC-04 Breaker 2B, Transformer TX-01"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Voltage Level <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.voltageLevel as string) || "415V / 3-Phase"}
                onChange={(e) => updateField("voltageLevel", e.target.value)}
                placeholder="e.g. 415V, 6.6kV, 11kV"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Isolation Points (comma separated) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={
                  Array.isArray(typeData.isolationPointsList)
                    ? typeData.isolationPointsList.join(", ")
                    : "Main Circuit Breaker CB-104, Local Isolator SW-02"
                }
                onChange={(e) =>
                  updateField(
                    "isolationPointsList",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="e.g. CB-01, Disconnect-02"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Lock Serial Numbers (comma separated) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={
                  Array.isArray(typeData.lockNumbers)
                    ? typeData.lockNumbers.join(", ")
                    : "LOCK-A401, LOCK-A402"
                }
                onChange={(e) =>
                  updateField(
                    "lockNumbers",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="e.g. L-101, L-102"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Danger Tag Numbers (comma separated) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={
                  Array.isArray(typeData.tagNumbers)
                    ? typeData.tagNumbers.join(", ")
                    : "TAG-901, TAG-902"
                }
                onChange={(e) =>
                  updateField(
                    "tagNumbers",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="e.g. TAG-01, TAG-02"
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Voltage Detector / Multimeter Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.testInstrumentUsed as string) || "Fluke T6-1000 Proved Tester (Calibrated)"}
                onChange={(e) => updateField("testInstrumentUsed", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Tested Dead By (Competent Person) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={(typeData.testedDeadBy as string) || "Arjun Nair (Chief Electrician)"}
                onChange={(e) => updateField("testedDeadBy", e.target.value)}
                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>

            <div className="space-y-2 md:col-span-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  required
                  checked={(typeData.zeroEnergyVerified as boolean) ?? true}
                  onChange={(e) => updateField("zeroEnergyVerified", e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>
                  I confirm Zero Energy Verification (Live-Dead-Live test) has been executed to prove zero voltage.
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={(typeData.earthingApplied as boolean) ?? true}
                  onChange={(e) => updateField("earthingApplied", e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-4 w-4"
                />
                <span>Portable safety grounding/earthing leads connected on all phases where required.</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {errors.typeData && <p className="text-xs text-red-500 mt-2">{errors.typeData}</p>}

      <div className="pt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          ← Back to Location
        </button>

        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold shadow-xs transition-colors"
        >
          Proceed to Safety Precautions →
        </button>
      </div>
    </form>
  );
}
