"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { Filter, RotateCcw, Search } from "lucide-react";

export interface FilterValues {
  status?: string;
  type?: string;
  plantId?: string;
  areaId?: string;
  equipmentId?: string;
  mine?: boolean;
  myApprovals?: boolean;
  date?: string;
  search?: string;
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
}

interface Equipment {
  id: string;
  areaId: string;
  tagNumber: string;
  name: string;
}

interface PermitFilterBarProps {
  filters: FilterValues;
  onChange: (newFilters: FilterValues) => void;
  showMineToggle?: boolean;
  showMyApprovalsToggle?: boolean;
  className?: string;
}

export function PermitFilterBar({
  filters,
  onChange,
  showMineToggle = true,
  showMyApprovalsToggle = true,
  className = "",
}: PermitFilterBarProps) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);

  // Fetch plants once
  useEffect(() => {
    api
      .get<{ data: Plant[] }>("/api/plants")
      .then((res) => setPlants(res.data))
      .catch(() => {});
  }, []);

  // Fetch areas when plantId changes
  useEffect(() => {
    const url = filters.plantId ? `/api/areas?plantId=${filters.plantId}` : "/api/areas";
    api
      .get<{ data: Area[] }>(url)
      .then((res) => setAreas(res.data))
      .catch(() => {});
  }, [filters.plantId]);

  // Fetch equipment when areaId changes
  useEffect(() => {
    const url = filters.areaId
      ? `/api/equipment?areaId=${filters.areaId}`
      : filters.plantId
      ? `/api/equipment?plantId=${filters.plantId}`
      : "/api/equipment";
    api
      .get<{ data: Equipment[] }>(url)
      .then((res) => setEquipmentList(res.data))
      .catch(() => {});
  }, [filters.areaId, filters.plantId]);

  const update = (patch: Partial<FilterValues>) => {
    onChange({ ...filters, ...patch });
  };

  const handleReset = () => {
    onChange({});
  };

  const hasActiveFilters = Boolean(
    filters.status ||
      filters.type ||
      filters.plantId ||
      filters.areaId ||
      filters.equipmentId ||
      filters.mine ||
      filters.myApprovals ||
      filters.date ||
      filters.search
  );

  return (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
          <Filter size={15} className="text-zinc-500" />
          <span>Filter Work Permits</span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset All</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Status Dropdown */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Permit Status
          </label>
          <select
            value={filters.status || ""}
            onChange={(e) => update({ status: e.target.value || undefined })}
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
            <option value="CLOSED">Closed</option>
            <option value="CLOSED_VERIFIED">Verified Closed</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Permit Type Dropdown */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Permit Type
          </label>
          <select
            value={filters.type || ""}
            onChange={(e) => update({ type: e.target.value || undefined })}
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All Permit Types</option>
            <option value="HOT_WORK">Hot Work</option>
            <option value="CONFINED_SPACE_ENTRY">Confined Space Entry</option>
            <option value="WORKING_AT_HEIGHT">Working at Height</option>
            <option value="ELECTRICAL_ISOLATION_LOTO">Electrical Isolation & LOTO</option>
          </select>
        </div>

        {/* Plant Hierarchy */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Plant
          </label>
          <select
            value={filters.plantId || ""}
            onChange={(e) =>
              update({
                plantId: e.target.value || undefined,
                areaId: undefined,
                equipmentId: undefined,
              })
            }
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All Plants</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {/* Area Hierarchy */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Area
          </label>
          <select
            value={filters.areaId || ""}
            onChange={(e) =>
              update({
                areaId: e.target.value || undefined,
                equipmentId: undefined,
              })
            }
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All Areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </div>

        {/* Equipment Selector */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Equipment
          </label>
          <select
            value={filters.equipmentId || ""}
            onChange={(e) => update({ equipmentId: e.target.value || undefined })}
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All Equipment</option>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.tagNumber} - {eq.name}
              </option>
            ))}
          </select>
        </div>

        {/* Planned Date Filter */}
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Planned Date
          </label>
          <input
            type="date"
            value={filters.date || ""}
            onChange={(e) => update({ date: e.target.value || undefined })}
            className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {/* Search Input */}
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
            Search Description / Permit #
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={filters.search || ""}
              onChange={(e) => update({ search: e.target.value || undefined })}
              placeholder="Search by work description, contractor, or permit #..."
              className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
        </div>
      </div>

      {/* Scope Toggles */}
      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-4 text-xs font-semibold">
        {showMineToggle && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.mine === true}
              onChange={(e) => update({ mine: e.target.checked || undefined })}
              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-3.5 w-3.5"
            />
            <span className="text-zinc-800 dark:text-zinc-200">
              Show Only My Permits (Created by me)
            </span>
          </label>
        )}

        {showMyApprovalsToggle && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.myApprovals === true}
              onChange={(e) => update({ myApprovals: e.target.checked || undefined })}
              className="rounded border-blue-500 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span className="text-blue-800 dark:text-blue-300">
              Show Only My Pending Approvals
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
