"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-zinc-600 dark:text-zinc-400" size={32} />
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Initializing OPMAINT PTW...
        </p>
      </div>
    </div>
  );
}
