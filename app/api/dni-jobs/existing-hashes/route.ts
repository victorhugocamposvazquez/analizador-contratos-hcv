import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { MAX_HASHES_PER_REQUEST } from "@/lib/existing-hashes-batch";
import { collectExistingDniAndContractsAndJobs } from "@/lib/collect-existing-hashes";

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
    ? (body.hashes as unknown[])
        .map((h) => String(h || "").trim().toLowerCase())
        .filter((h): h is string => /^[a-f0-9]{64}$/.test(h))
    : [];
  if (hashes.length === 0)
    return NextResponse.json({ error: "falta hashes válidos (SHA-256 hex)" }, { status: 400 });

  if (hashes.length > MAX_HASHES_PER_REQUEST) {
    return NextResponse.json(
      { error: `máximo ${MAX_HASHES_PER_REQUEST} hashes por petición (divide la selección o sube por partes)` },
      { status: 400 }
    );
  }

  let set: Set<string>;
  try {
    set = await collectExistingDniAndContractsAndJobs(supabase, [...new Set(hashes)]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const existing_hashes = hashes.filter((h) => set.has(h));
  return NextResponse.json({ existing: existing_hashes });
}
