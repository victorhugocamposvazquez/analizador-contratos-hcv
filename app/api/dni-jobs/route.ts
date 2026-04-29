import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Crea un lote DNI nuevo. Body: { name?, total_files } */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { name, total_files } = await req.json();
  const { data, error } = await supabase
    .from("dni_batches")
    .insert({
      created_by: user.id,
      name: typeof name === "string" && name.trim() !== "" ? name.trim().slice(0, 240) : null,
      total_files: typeof total_files === "number" ? Math.max(0, total_files) : 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batch_id: data!.id });
}
