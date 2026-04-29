import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { removeContractStorageFiles } from "@/lib/storage-delete";

export const runtime = "nodejs";

/** Borra contratos: primero objetos en Storage, luego filas. POST { ids: string[] } */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "missing ids" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "máximo 500 por vez" }, { status: 400 });
  }

  const { data: rows, error: selErr } = await supabase
    .from("contracts")
    .select("storage_path")
    .in("id", ids);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const st = await removeContractStorageFiles(
    supabase,
    (rows ?? []).map((r) => r.storage_path as string | null)
  );
  if (st.error) return NextResponse.json({ error: st.error }, { status: 500 });

  const { error, count } = await supabase.from("contracts").delete({ count: "exact" }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? ids.length });
}
