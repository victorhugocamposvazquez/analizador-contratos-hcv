import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Crea un batch nuevo. Devuelve batch_id.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { name, total_files } = await req.json();
  const { data, error } = await supabase
    .from("batches")
    .insert({
      created_by: user.id,
      name: name || `Lote ${new Date().toLocaleString("es-ES")}`,
      total_files: total_files ?? 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batch_id: data.id });
}
