import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import NavTabs from "@/components/NavTabs";

export default async function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pendientes de revisar (badge)
  const { count: reviewCount } = await supabase
    .from("contracts")
    .select("*", { count: "exact", head: true })
    .eq("status", "needs_review");

  // Jobs en marcha (badge)
  const { count: jobsActive } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/contracts" className="font-semibold tracking-tight">
            Analizador de contratos HCV
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
        <NavTabs reviewCount={reviewCount ?? 0} jobsActive={jobsActive ?? 0} />
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
