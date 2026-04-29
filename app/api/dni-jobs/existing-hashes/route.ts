import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Qué hashes de fichero ya existen como job DNI o contrato subido recientemente. */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const hashes = Array.isArray(body.hashes)
    ? (body.hashes as unknown[]).map((h) => String(h || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (hashes.length === 0)
    return NextResponse.json({ error: "falta hashes" }, { status: 400 });
  if (hashes.length > 2000) {
    return NextResponse.json({ error: "demasiados hashes por petición" }, { status: 400 });
  }

  const { data: dniRows } = await supabase
    .from("dni_jobs")
    .select("content_sha256")
    .in("content_sha256", hashes);
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("content_sha256")
    .in("content_sha256", hashes);
  const { data: ctrRows } = await supabase
    .from("contracts")
    .select("content_sha256")
    .in("content_sha256", hashes);

  const set = new Set<string>();
  const add = (r: { content_sha256?: string | null } | undefined) => {
    const h = r?.content_sha256?.toLowerCase();
    if (h) set.add(h);
  };
  for (const r of dniRows ?? []) add(r as { content_sha256?: string | null });
  for (const r of jobRows ?? []) add(r as { content_sha256?: string | null });
  for (const r of ctrRows ?? []) add(r as { content_sha256?: string | null });

  const existing_hashes = hashes.filter((h) => set.has(h));
  return NextResponse.json({ existing: existing_hashes });
}
