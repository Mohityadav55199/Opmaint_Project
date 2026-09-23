"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PermitFilterBar, FilterValues } from "@/components/permits/PermitFilterBar";
import { PermitTable } from "@/components/dashboard/PermitTable";
import { Pagination } from "@/components/ui/Pagination";
import { api } from "@/lib/api/client";
import { PlusCircle, Loader2, RefreshCw, FileText } from "lucide-react";
import { DashboardPermitItem } from "@/components/dashboard/ExpiringBanner";

interface PermitsResponse {
  data: DashboardPermitItem[];
  total: number;
  page: number;
  pageSize: number;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export default function PermitsListPage() {
  const [loading, setLoading] = useState(true);
  const [permits, setPermits] = useState<DashboardPermitItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<FilterValues>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPermits() {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        if (filters.status) params.set("status", filters.status);
        if (filters.type) params.set("type", filters.type);
        if (filters.plantId) params.set("plantId", filters.plantId);
        if (filters.areaId) params.set("areaId", filters.areaId);
        if (filters.equipmentId) params.set("equipmentId", filters.equipmentId);
        if (filters.mine) params.set("mine", "true");
        if (filters.myApprovals) params.set("myApprovals", "true");
        if (filters.date) params.set("date", filters.date);

        const res = await api.get<PermitsResponse>(`/api/permits?${params.toString()}`);
        if (!cancelled) {
          setPermits(res.data);
          setTotal(res.total);
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load permits list.");
          setLoading(false);
        }
      }
    }

    loadPermits();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, filters, reloadToken]);

  const handleManualRefresh = () => {
    setLoading(true);
    setReloadToken((prev) => prev + 1);
  };

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  const displayedPermits = permits.filter((p) => {
    if (!filters.search) return true;
    const term = filters.search.toLowerCase();
    return (
      p.permitNumber.toLowerCase().includes(term) ||
      p.workDescription.toLowerCase().includes(term) ||
      p.equipment?.name?.toLowerCase().includes(term) ||
      p.equipment?.tagNumber?.toLowerCase().includes(term) ||
      p.requester?.name?.toLowerCase().includes(term)
    );
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={22} className="text-zinc-700 dark:text-zinc-300" />
            <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
              Permit Registry
            </h1>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Complete database of work permits, hazard assessments, and authorization lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <Link
            href="/permits/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold shadow-xs transition-colors"
          >
            <PlusCircle size={15} />
            <span>Create Permit</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
          <strong>Error loading permits:</strong> {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="mb-4">
        <PermitFilterBar
          filters={filters}
          onChange={handleFilterChange}
          showMineToggle={true}
          showMyApprovalsToggle={true}
        />
      </div>

      {/* Table & Pagination */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 px-1">
          <span>Found {total} permit records</span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 size={13} className="animate-spin" />
              <span>Fetching records...</span>
            </span>
          )}
        </div>

        <PermitTable
          permits={displayedPermits}
          emptyMessage="No permits match the specified filters."
          onClearFilters={() => setFilters({})}
        />

        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(ps) => {
              setPageSize(ps);
              setPage(1);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
