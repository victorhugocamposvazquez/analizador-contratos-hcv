"use client";

import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
    >
      Salir
    </button>
  );
}
