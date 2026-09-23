"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { Cpu, UserCheck } from "lucide-react";

export interface Step2Data {
  plantId: string;
  areaId: string;
  equipmentId: string;
}

interface Plant {
  id: string;
  code: string;
  name: string;
}

interface Area {
  id: string;
  plantId: string;
  code: string;
  name: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
}

interface Equipment {
  id: string;
  areaId: string;
  tagNumber: string;
  name: string;
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  area?: Area;
}

interface Step2LocationProps {
  data: Step2Data;
  onChange: (patch: Partial<Step2Data>) => void;
  onNext: () => void;
  onBack: () => void;
  errors?: Record<string, string>;
}

export function Step2Location({
  data,
  onChange,
  onNext,
  onBack,
  errors = {},
}: Step2LocationProps) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);

  // Fetch plants
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Plant[] }>("/api/plants")
      .then((res) => {
        if (!cancelled) setPlants(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch areas when plantId changes
  useEffect(() => {
    let cancelled = false;
    if (!data.plantId) {
      Promise.resolve().then(() => {
        if (!cancelled) setAreas([]);
      });
      return () => {
        cancelled = true;
      };
    }
    api
      .get<{ data: Area[] }>(`/api/areas?plantId=${data.plantId}`)
      .then((res) => {
        if (!cancelled) setAreas(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data.plantId]);

  // Fetch equipment when areaId changes
  useEffect(() => {
    let cancelled = false;
    if (!data.areaId) {
      Promise.resolve().then(() => {
        if (!cancelled) setEquipmentList([]);
      });
      return () => {
        cancelled = true;
      };
    }
    api
      .get<{ data: Equipment[] }>(`/api/equipment?areaId=${data.areaId}`)
      .then((res) => {
        if (!cancelled) setEquipmentList(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data.areaId]);

  const selectedArea = areas.find((a) => a.id === data.areaId);
  const selectedEquipment = equipmentList.find((e) => e.id === data.equipmentId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.equipmentId) return;
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
          Hierarchical Location Resolution
        </h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Industrial equipment is strictly bound to its physical Area and Plant hierarchy. Approvals are
          automatically routed to the designated Area Owner.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Plant Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
            1. Operating Plant <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              required
              value={data.plantId}
              onChange={(e) =>
                onChange({
                  plantId: e.target.value,
                  areaId: "",
                  equipmentId: "",
                })
              }
              className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="">— Select Plant —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>
          {errors.plantId && <p className="text-xs text-red-500 mt-1">{errors.plantId}</p>}
        </div>

        {/* Area Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
            2. Production Area <span className="text-red-500">*</span>
          </label>
          <select
            required
            disabled={!data.plantId}
            value={data.areaId}
            onChange={(e) =>
              onChange({
                areaId: e.target.value,
                equipmentId: "",
              })
            }
            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="">— Select Area —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
          {errors.areaId && <p className="text-xs text-red-500 mt-1">{errors.areaId}</p>}
        </div>

        {/* Equipment Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
            3. Target Equipment <span className="text-red-500">*</span>
          </label>
          <select
            required
            disabled={!data.areaId}
            value={data.equipmentId}
            onChange={(e) => onChange({ equipmentId: e.target.value })}
            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="">— Select Equipment —</option>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.tagNumber} - {eq.name} ({eq.criticality})
              </option>
            ))}
          </select>
          {errors.equipmentId && (
            <p className="text-xs text-red-500 mt-1">{errors.equipmentId}</p>
          )}
        </div>
      </div>

      {/* Selected Equipment & Approval Authority Preview Card */}
      {selectedEquipment && (
        <div className="p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="text-zinc-600 dark:text-zinc-300" size={18} />
              <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {selectedEquipment.tagNumber}
              </span>
              <span className="text-xs text-zinc-500">• {selectedEquipment.name}</span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                selectedEquipment.criticality === "CRITICAL"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : selectedEquipment.criticality === "HIGH"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-zinc-100 text-zinc-700 border-zinc-200"
              }`}
            >
              {selectedEquipment.criticality} CRITICALITY
            </span>
          </div>

          {selectedArea?.owner && (
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
              <UserCheck size={15} className="text-blue-500 shrink-0" />
              <span>
                Area Approval Obligation:{" "}
                <strong className="text-zinc-900 dark:text-zinc-200">
                  {selectedArea.owner.name}
                </strong>{" "}
                ({selectedArea.owner.email})
              </span>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          ← Back to Basics
        </button>

        <button
          type="submit"
          disabled={!data.equipmentId}
          className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
        >
          Proceed to Safety & Type Data →
        </button>
      </div>
    </form>
  );
}
