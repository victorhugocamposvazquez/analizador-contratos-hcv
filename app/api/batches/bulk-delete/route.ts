import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Borra lotes y contratos enlazados, luego el lote (jobs en cascade). POST { ids: string[] } */
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
  if (ids.length > 100) {
    return NextResponse.json({ error: "máximo 100 por vez" }, { status: 400 });
  }

  const { error: delC } = await supabase.from("contracts").delete().in("batch_id", ids);
  if (delC) return NextResponse.json({ error: delC.message }, { status: 500 });

  const { error: delB, count } = await supabase.from("batches").delete({ count: "exact" }).in("id", ids);
  if (delB) return NextResponse.json({ error: delB.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? ids.length });
}
