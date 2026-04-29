import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Devuelve qué hashes (SHA-256 hex) ya existen en jobs o contratos. POST { hashes: string[] } */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const hashes = Array.isArray(body.hashes)
    ? body.hashes.filter((h: unknown) => typeof h === "string" && /^[a-f0-9]{64}$/i.test(h))
    : [];
  if (hashes.length === 0) {
    return NextResponse.json({ existing: [] as string[] });
  }
  if (hashes.length > 2000) {
    return NextResponse.json({ error: "máximo 2000 hashes por petición" }, { status: 400 });
  }

  const lower = [...new Set(hashes.map((h: string) => h.toLowerCase()))];

  const [jobsRes, contractsRes] = await Promise.all([
    supabase.from("jobs").select("content_sha256").in("content_sha256", lower),
    supabase.from("contracts").select("content_sha256").in("content_sha256", lower),
  ]);

  const found = new Set<string>();
  for (const row of jobsRes.data ?? []) {
    const h = (row as { content_sha256: string | null }).content_sha256;
    if (h) found.add(h.toLowerCase());
  }
  for (const row of contractsRes.data ?? []) {
    const h = (row as { content_sha256: string | null }).content_sha256;
    if (h) found.add(h.toLowerCase());
  }

  return NextResponse.json({ existing: [...found] });
}
