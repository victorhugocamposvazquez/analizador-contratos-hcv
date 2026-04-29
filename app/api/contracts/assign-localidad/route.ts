import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * Asigna texto de localidad a contratos que aún no tenían (clave normalizada vacía).
 * valida en BD que el texto encaja con p_target_norm (misma carpeta).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const ids = body.ids as unknown;
  const localidad = body.localidad as unknown;
  const target_norm = body.target_norm as unknown;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "falta ids" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "máximo 500 contratos por vez" }, { status: 400 });
  }
  const strIds = ids.map((id) => String(id)).filter((id) => id.length === 36);
  if (strIds.length !== ids.length) {
    return NextResponse.json({ error: "ids inválidos" }, { status: 400 });
  }

  const loc = typeof localidad === "string" ? localidad.trim() : "";
  if (!loc) {
    return NextResponse.json({ error: "la localidad no puede estar vacía" }, { status: 400 });
  }

  if (typeof target_norm !== "string") {
    return NextResponse.json({ error: "falta target_norm" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("assign_localidad_from_empty", {
    p_contract_ids: strIds,
    p_localidad: loc,
    p_target_norm: target_norm,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = typeof data === "number" ? data : Number(data ?? 0);
  return NextResponse.json({ ok: true, updated });
}
