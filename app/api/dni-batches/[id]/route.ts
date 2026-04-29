import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = context.params.id;
  const body = await req.json();
  const raw = typeof body.name === "string" ? body.name.trim() : "";
  const name = raw.length === 0 ? null : raw.slice(0, 240);

  const { error } = await supabase.from("dni_batches").update({ name }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name });
}
