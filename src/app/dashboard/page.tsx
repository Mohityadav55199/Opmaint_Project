"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { SummaryCards, DashboardSummary } from "@/components/dashboard/SummaryCards";
import { ExpiringBanner, DashboardPermitItem } from "@/components/dashboard/ExpiringBanner";
import { PendingApprovalsCard } from "@/components/dashboard/PendingApprovalsCard";
import { PermitFilterBar, FilterValues } from "@/components/permits/PermitFilterBar";
import { PermitTable } from "@/components/dashboard/PermitTable";
import { Pagination } from "@/components/ui/Pagination";
import { api } from "@/lib/api/client";
import { formatRole } from "@/lib/utils/formatters";
import { PlusCircle, Loader2, RefreshCw } from "lucide-react";

interface DashboardResponse {
  permits: DashboardPermitItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  activePermits: DashboardPermitItem[];
  expiringPermits: DashboardPermitItem[];
  myPendingApprovals: DashboardPermitItem[];
  summary: DashboardSummary;
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<FilterValues>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
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

        const res = await api.get<{ data: DashboardResponse }>(
          `/api/dashboard?${params.toString()}`
        );
        if (!cancelled) {
          setData(res.data);
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
          setLoading(false);
        }
      }
    }

    loadDashboard();

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
    setPage(1); // Reset to page 1 on filter change
  };

  const handleQuickFilter = (quick: { status?: string; mine?: boolean; myApprovals?: boolean }) => {
    setFilters((prev) => {
      // Toggle logic if clicking already active filter
      if (quick.status && prev.status === quick.status) {
        const next = { ...prev };
        delete next.status;
        return next;
      }
      if (quick.myApprovals && prev.myApprovals === true) {
        const next = { ...prev };
        delete next.myApprovals;
        return next;
      }
      return {
        ...prev,
        ...quick,
      };
    });
    setPage(1);
  };

  // Filter client-side by text search if provided
  const displayedPermits = (data?.permits ?? []).filter((p) => {
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
      {/* Top Welcome & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
            Safety Control Center
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Operational Permit-to-Work Dashboard • Logged in as{" "}
            <strong className="text-zinc-900 dark:text-zinc-200">{user?.name}</strong> (
            {user?.role && formatRole(user.role)})
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
            <span>Create New Permit</span>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
          <strong>Error loading dashboard:</strong> {error}
        </div>
      )}

      {/* High Priority Alerts: Expiring Permits within 2 Hours */}
      {data && <ExpiringBanner expiringPermits={data.expiringPermits} />}

      {/* Actionable Obligations: Pending Approvals for Authenticated User */}
      {data && <PendingApprovalsCard permits={data.myPendingApprovals} />}

      {/* Summary KPI Metric Cards */}
      {data && (
        <SummaryCards
          summary={data.summary}
          activeFilter={filters}
          onFilterSelect={handleQuickFilter}
        />
      )}

      {/* Filter Bar */}
      <div className="mb-4">
        <PermitFilterBar
          filters={filters}
          onChange={handleFilterChange}
          showMineToggle={true}
          showMyApprovalsToggle={user?.role !== "REQUESTER"}
        />
      </div>

      {/* Permits Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 px-1">
          <span>
            {filters.myApprovals
              ? "My Pending Approval Obligations"
              : filters.mine
              ? "My Created Permits"
              : "Active & Filtered Permits"}{" "}
            ({data?.pagination?.total ?? 0})
          </span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 size={13} className="animate-spin" />
              <span>Updating...</span>
            </span>
          )}
        </div>

        <PermitTable
          permits={displayedPermits}
          emptyMessage="No permits match the current status, location, or search filters."
          onClearFilters={() => setFilters({})}
        />

        {data?.pagination && data.pagination.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.pagination.total}
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
