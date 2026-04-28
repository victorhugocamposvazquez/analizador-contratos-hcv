"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/contracts");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-6 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analizador de contratos HCV</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-slate-900 text-white text-sm font-medium rounded-lg py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
        <p className="text-xs text-slate-500">
          Las cuentas las crea el administrador desde Supabase.
        </p>
      </form>
    </main>
  );
}
