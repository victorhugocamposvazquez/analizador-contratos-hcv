import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { removeContractStorageFiles } from "@/lib/storage-delete";

export const runtime = "nodejs";

// Actualiza un contrato (desde la pestaña Revisar, típicamente)
// Acepta { id, fields, status, marked_duplicate }
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id, fields, status, marked_duplicate } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const update: Record<string, any> = {};
  if (fields) {
    const allowed = [
      "num_albaran",
      "fecha_promocion",
      "fecha_entrega",
      "hora_entrega",
      "nombre",
      "apellido_1",
      "apellido_2",
      "nif",
      "telefono",
      "otros_telefonos",
      "fecha_nacimiento",
      "pais_nacimiento",
      "estado_civil",
      "direccion",
      "localidad",
      "cod_postal",
      "provincia",
      "banco",
      "iban",
      "articulos",
      "importe_total",
      "num_cuotas",
      "cuota_mensual",
      "notes",
    ];
    for (const k of allowed) {
      if (k in fields) update[k] = fields[k] === "" ? null : fields[k];
    }
  }
  if (status) update.status = status; // confirmed | discarded | needs_review
  if (typeof marked_duplicate === "boolean") update.marked_duplicate = marked_duplicate;

  const { error } = await supabase.from("contracts").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Borrar contrato: primero el fichero en Storage (API), luego la fila.
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: row, error: selErr } = await supabase
    .from("contracts")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const paths = row?.storage_path ? [row.storage_path as string] : [];
  const st = await removeContractStorageFiles(supabase, paths);
  if (st.error) return NextResponse.json({ error: st.error }, { status: 500 });

  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
