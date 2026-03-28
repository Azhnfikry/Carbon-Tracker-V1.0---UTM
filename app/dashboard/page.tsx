"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CarbonDashboard } from "@/components/carbon-dashboard";
import type { User } from "@supabase/supabase-js";

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 1000, "Supabase session");
        const currentUser = data?.session?.user || null;
        setUser(currentUser);

        if (currentUser) {
          const { data: profileData } = await withTimeout(
            supabase
              .from("profiles")
              .select("*")
              .eq("id", currentUser.id)
              .single(),
            1000,
            "Profile fetch"
          );

          setProfile(profileData);
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <CarbonDashboard user={user} profile={profile} />;
}
