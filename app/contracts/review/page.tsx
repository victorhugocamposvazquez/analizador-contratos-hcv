import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import ReviewClient from "@/components/ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = createClient();

  const { data: needsReview } = await supabase
    .from("contracts")
    .select("*")
    .eq("status", "needs_review")
    .order("created_at", { ascending: true });

  if (!needsReview || needsReview.length === 0) {
    return (
      <div className="bg-white border rounded-2xl shadow-sm p-12 text-center text-slate-500">
        🎉 Nada pendiente de revisar.{" "}
        <Link href="/contracts" className="underline">
          Ver listado
        </Link>
      </div>
    );
  }

  // Para cada uno, comprueba duplicados (puede haber cambiado el listado desde la inserción)
  const enriched = await Promise.all(
    needsReview.map(async (c) => {
      const { data: dups } = await supabase.rpc("find_duplicates", {
        p_nif: c.nif,
        p_fecha_promocion: c.fecha_promocion,
        p_num_albaran: c.num_albaran,
        p_exclude_id: c.id,
      });
      const { data: signed } = await supabase.storage
        .from("contracts")
        .createSignedUrl(c.storage_path, 60 * 60);
      return { contract: c, duplicates: dups ?? [], imageUrl: signed?.signedUrl };
    })
  );

  return <ReviewClient items={enriched} />;
}
