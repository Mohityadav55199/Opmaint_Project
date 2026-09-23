"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Shield, Lock, Mail, ArrowRight, Loader2, UserCheck } from "lucide-react";

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Invalid credentials. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const setDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("password123");
    setError(null);
  };

  const demoAccounts = [
    {
      role: "Permit Requester",
      name: "Sunil Verma (Maintenance Lead)",
      email: "requester@opmaint.local",
      badge: "Create & Close Permits",
      color: "border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
    },
    {
      role: "Area Owner (Press)",
      name: "Vikram Mehta (Plant 1 Press)",
      email: "ao.press@opmaint.local",
      badge: "Area Approval Authority",
      color: "border-blue-200 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 dark:hover:bg-blue-950/40",
    },
    {
      role: "Safety Officer",
      name: "Rajesh Kulkarni (Chief Safety)",
      email: "safety.officer@opmaint.local",
      badge: "Safety Approval, Suspend, Verify",
      color: "border-teal-200 bg-teal-50/50 hover:bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20 dark:hover:bg-teal-950/40",
    },
    {
      role: "Plant Administrator",
      name: "Super Admin",
      email: "admin@opmaint.local",
      badge: "System-wide Oversight",
      color: "border-purple-200 bg-purple-50/50 hover:bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20 dark:hover:bg-purple-950/40",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md">
            <Shield size={28} className="text-amber-400 dark:text-amber-600" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          OPMAINT PTW
        </h2>
        <p className="mt-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Enterprise Permit-to-Work & Safety Governance Module
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-zinc-900 py-8 px-6 shadow-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50 flex items-start gap-2">
                <span className="font-bold">Error:</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-zinc-700 dark:text-zinc-300"
              >
                Work Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Mail size={16} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@opmaint.local"
                  className="block w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Lock size={16} />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Fill Demo Roles */}
          <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 mb-3 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <UserCheck size={14} className="text-amber-500" />
              <span>Evaluator Demo Profiles (Click to fill)</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setDemoAccount(account.email)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors flex items-center justify-between ${account.color}`}
                >
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-zinc-100">
                      {account.role}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {account.name}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-white/80 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                    {account.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Opmaint CMMS • Industry Standard Permit-to-Work Implementation
        </p>
      </div>
    </div>
  );
}
