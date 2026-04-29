import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import ReviewClient from "@/components/ReviewClient";
import { originalFilenameFromJobEmbed } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = createClient();

  const { data: rawNeeds } = await supabase
    .from("contracts")
    .select(
      `
      *,
      jobs!contracts_job_id_fkey ( original_filename )
    `
    )
    .eq("status", "needs_review")
    .order("created_at", { ascending: true });

  const needsReview = (rawNeeds ?? []).map((row: Record<string, unknown>) => {
    const fromJob = originalFilenameFromJobEmbed(row.jobs);
    const { jobs: _omitJobs, ...rest } = row;
    return {
      ...rest,
      original_filename:
        ((rest.original_filename as string | null) ?? fromJob) ?? null,
    } as Record<string, unknown>;
  });

  if (!needsReview.length) {
    return (
      <div className="bg-white border rounded-2xl shadow-sm p-12 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-lg text-slate-800 font-medium">No hay nada pendiente de revisión</p>
        <p className="text-sm text-slate-600 leading-relaxed">
          Cuando haya fotos con posibles duplicados o lectura dudosa, aparecerán aquí.
        </p>
        <Link href="/contracts" className="text-slate-900 font-medium underline text-sm inline-block">
          Ir al listado de contratos guardados
        </Link>
      </div>
    );
  }

  // Para cada uno, comprueba duplicados (puede haber cambiado el listado desde la inserción)
  const enriched = await Promise.all(
    needsReview.map(async (c: Record<string, unknown>) => {
      const { data: dups } = await supabase.rpc("find_duplicates", {
        p_nif: (c.nif as string | null) ?? null,
        p_fecha_promocion: (c.fecha_promocion as string | null) ?? null,
        p_num_albaran: (c.num_albaran as string | null) ?? null,
        p_exclude_id: c.id as string,
        p_iban: (c.iban as string | null) ?? null,
        p_importe_total: (c.importe_total as number | null) ?? null,
      });
      const { data: signed } = await supabase.storage
        .from("contracts")
        .createSignedUrl(c.storage_path as string, 60 * 60);
      return {
        contract: c,
        duplicates: dups ?? [],
        imageUrl: signed?.signedUrl,
      };
    })
  );

  return <ReviewClient items={enriched} />;
}
