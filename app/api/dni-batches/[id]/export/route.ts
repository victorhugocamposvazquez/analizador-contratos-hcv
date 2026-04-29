import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  fetchAllDniExtractionsForBatch,
  fetchAllDniJobsForBatch,
} from "@/lib/dni-batch-queries";

export const runtime = "nodejs";

function csvEscape(s: string): string {
  const t = String(s ?? "");
  if (/[\n\r",;]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** CSV separado por punto y coma (compatible Excel ES). */
export async function GET(
  _: Request,
  context: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const batchId = context.params.id;

  const { data: jobs, error: e1 } = await fetchAllDniJobsForBatch(supabase, batchId);
  if (e1) return NextResponse.json({ error: e1 }, { status: 500 });

  const { data: exs, error: e2 } = await fetchAllDniExtractionsForBatch(
    supabase,
    batchId,
    "*"
  );
  if (e2) return NextResponse.json({ error: e2 }, { status: 500 });

  const exByJob = new Map(
    (exs ?? []).map((e) => [e.dni_job_id as string, e] as const)
  );

  const header = [
    "archivo",
    "storage_path",
    "numero_documento",
    "modulo23_ok",
    "confianza",
    "estado_extraccion",
    "estado_job",
    "notas_errors",
  ].join(";");

  const lines = (jobs ?? []).map((j) => {
    const ex = exByJob.get(j.id) as
      | {
          numero_documento?: string | null;
          nif_valid?: boolean | null;
          extraction_confidence?: number | null;
          status?: string | null;
          notes?: string | null;
        }
      | undefined;
    const path = (j.storage_path as string) ?? "";
    const file = (j.original_filename as string) ?? "";
    const num = ex?.numero_documento ?? "";
    const ok =
      ex?.nif_valid === null || ex?.nif_valid === undefined
        ? ""
        : ex.nif_valid
          ? "si"
          : "no";
    const conf =
      ex?.extraction_confidence != null ? String(ex.extraction_confidence) : "";
    const stEx = ex?.status ?? "";
    const stJob = String(j.status ?? "");
    const tip = (
      ((ex?.notes ?? "") + " " + ((j.last_error as string) ?? "")).replace(/\r?\n/g, " ").trim()
    ).slice(0, 2000);
    return [
      csvEscape(file || path.split("/").pop() || ""),
      csvEscape(path),
      csvEscape(num),
      csvEscape(ok),
      csvEscape(conf),
      csvEscape(stEx),
      csvEscape(stJob),
      csvEscape(tip),
    ].join(";");
  });

  const body = "\ufeff" + [header, ...lines].join("\r\n");
  const fname = `dni-lote-${batchId.slice(0, 8)}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
