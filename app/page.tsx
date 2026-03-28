import { createClient } from "@/lib/supabase/server"
import { CarbonDashboard } from "@/components/carbon-dashboard"

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}

export default async function HomePage() {
  let user = null
  let profile = null

  try {
    const supabase = await createClient()
    const { data } = await withTimeout(supabase.auth.getUser(), 1000, "Supabase auth")
    user = data?.user || null

    // Get user profile only if user is authenticated
    if (user) {
      try {
        const { data: profileData } = await withTimeout(
          supabase.from("profiles").select("*").eq("id", user.id).single(),
          1000,
          "Profile fetch"
        )
        profile = profileData
      } catch (profileError) {
        console.warn('Profile fetch error:', profileError)
      }
    }
  } catch (error) {
    console.warn('Auth or Supabase connection error - continuing in offline mode:', error)
    // App will work without auth/profile in offline mode
  }

  return <CarbonDashboard user={user} profile={profile} />
}
