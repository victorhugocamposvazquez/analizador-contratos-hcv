import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** DELETE dni_batches cascades jobs, extracciones y objetos en bucket (trigger). */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "missing ids" }, { status: 400 });
  if (ids.length > 100)
    return NextResponse.json({ error: "máximo 100 por vez" }, { status: 400 });

  const { error, count } = await supabase
    .from("dni_batches")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? ids.length });
}
