import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { MAX_HASHES_PER_REQUEST } from "@/lib/existing-hashes-batch";
import { collectExistingInContractsAndJobs } from "@/lib/collect-existing-hashes";

export const runtime = "nodejs";

/** Devuelve qué hashes (SHA-256 hex) ya existen en jobs o contratos. POST { hashes: string[] } */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json()) as { hashes?: unknown };
  const hashes: string[] = Array.isArray(body.hashes)
    ? body.hashes.filter(
        (h: unknown): h is string => typeof h === "string" && /^[a-f0-9]{64}$/i.test(h)
      )
    : [];
  if (hashes.length === 0) {
    return NextResponse.json({ existing: [] as string[] });
  }
  if (hashes.length > MAX_HASHES_PER_REQUEST) {
    return NextResponse.json(
      { error: `máximo ${MAX_HASHES_PER_REQUEST} hashes por petición (divide la selección o sube por partes)` },
      { status: 400 }
    );
  }

  const lower = [...new Set(hashes.map((h: string) => h.toLowerCase()))];

  let found: Set<string>;
  try {
    found = await collectExistingInContractsAndJobs(supabase, lower);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ existing: [...found] });
}
