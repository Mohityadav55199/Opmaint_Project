"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatRole } from "@/lib/utils/formatters";
import {
  Shield,
  LayoutDashboard,
  FileText,
  PlusCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/permits", label: "Permits", icon: FileText },
    { href: "/permits/new", label: "New Permit", icon: PlusCircle, isPrimary: true },
  ];

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
      case "SAFETY_OFFICER":
        return "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800";
      case "AREA_OWNER":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
      case "REQUESTER":
        return "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      default:
        return "bg-zinc-100 text-zinc-800 border-zinc-200";
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded-lg p-1"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs">
                <Shield size={20} className="text-amber-400 dark:text-amber-600" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 text-base">
                    OPMAINT
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    PTW
                  </span>
                </div>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">
                  Permit to Work Module
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 ml-6 border-l border-zinc-200 dark:border-zinc-800 pl-6">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  link.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(link.href) &&
                      (link.href !== "/permits" || pathname === "/permits");

                if (link.isPrimary) {
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-xs transition-colors"
                    >
                      <Icon size={14} />
                      <span>{link.label}</span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <Icon size={15} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Side: User Profile & Actions */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-2.5 text-right">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {user.name}
                </span>
                <span
                  className={`mt-0.5 inline-block text-[10px] font-semibold px-2 py-0.2 rounded-full border ${getRoleBadgeStyle(
                    user.role
                  )}`}
                >
                  {formatRole(user.role)}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold text-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />

            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 space-y-2">
          <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {user.name}
              </div>
              <div className="text-xs text-zinc-500">{user.email}</div>
            </div>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeStyle(
                user.role
              )}`}
            >
              {formatRole(user.role)}
            </span>
          </div>

          <div className="space-y-1 pt-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href) &&
                    (link.href !== "/permits" || pathname === "/permits");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <Icon size={16} />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
