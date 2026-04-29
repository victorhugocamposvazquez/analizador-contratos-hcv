/**
 * Coherente con RPC find_duplicates: prioridad mismo nº de albarán cuando ambos tienen;
 * si no hay albarán comparable, NIF + misma fecha (solo filas contrato_venta).
 */
export type DupClusterContract = {
  id: string;
  nif: string | null;
  fecha_promocion: string | null;
  num_albaran: string | null;
  iban: string | null;
  importe_total: string | number | null;
  status?: string | null;
  marked_duplicate?: boolean | null;
  document_class?: string | null;
};

function normNif(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  return s.toUpperCase().replace(/\s/g, "");
}

function isContratoVenta(c: DupClusterContract): boolean {
  const d = c.document_class ?? "contrato_venta";
  return d === "contrato_venta";
}

function normAlbaran(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function oneWayDuplicate(newRow: DupClusterContract, existing: DupClusterContract): boolean {
  const pAlb = normAlbaran(newRow.num_albaran);
  const cAlb = normAlbaran(existing.num_albaran);
  const na = normNif(newRow.nif);
  const nb = normNif(existing.nif);

  if (pAlb !== "" && cAlb !== "") {
    return pAlb === cAlb;
  }
  if (pAlb === "") {
    return !!(
      na &&
      nb &&
      newRow.fecha_promocion &&
      existing.fecha_promocion &&
      na === nb &&
      newRow.fecha_promocion === existing.fecha_promocion
    );
  }
  return false;
}

export function duplicatePairWithinBatch(a: DupClusterContract, b: DupClusterContract): boolean {
  if (a.id === b.id) return false;
  if (!isContratoVenta(a) || !isContratoVenta(b)) return false;
  return oneWayDuplicate(a, b) || oneWayDuplicate(b, a);
}

function findRoot(parent: Map<string, string>, x: string): string {
  let p = parent.get(x) ?? x;
  if (p !== x) {
    p = findRoot(parent, p);
    parent.set(x, p);
  }
  return p;
}

function union(parent: Map<string, string>, a: string, b: string) {
  const ra = findRoot(parent, a);
  const rb = findRoot(parent, b);
  if (ra !== rb) parent.set(ra, rb);
}

/** Agrupa IDs de contratos del lote que coinciden entre sí (union-find). */
export function clusterContractIds(contracts: DupClusterContract[]): string[][] {
  if (contracts.length === 0) return [];
  const parent = new Map<string, string>();
  for (const c of contracts) parent.set(c.id, c.id);

  const n = contracts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (duplicatePairWithinBatch(contracts[i], contracts[j])) {
        union(parent, contracts[i].id, contracts[j].id);
      }
    }
  }

  const byRoot = new Map<string, string[]>();
  for (const c of contracts) {
    const r = findRoot(parent, c.id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(c.id);
  }
  return [...byRoot.values()];
}

export type BatchDupStats = {
  /** Contratos que no coinciden con ninguna otra foto de este mismo lote */
  sinDuplicarEnLote: number;
  /** Contratos que forman parte de un grupo de 2+ (coincidencias entre sí) */
  contratosEnGrupoDuplicado: number;
  /** Número de grupos distintos con 2+ contratos */
  gruposDuplicados: number;
  /** Contratos pendientes de revisión humana (estado BD) */
  porRevisar: number;
};

export function summarizeBatchDuplicates(
  contracts: DupClusterContract[],
  clusters: string[][]
): BatchDupStats {
  const porRevisar = contracts.filter((c) => c.status === "needs_review").length;

  let sinDuplicarEnLote = 0;
  let contratosEnGrupoDuplicado = 0;
  let gruposDuplicados = 0;

  for (const g of clusters) {
    if (g.length >= 2) {
      gruposDuplicados += 1;
      contratosEnGrupoDuplicado += g.length;
    } else if (g.length === 1) {
      sinDuplicarEnLote += 1;
    }
  }

  return {
    sinDuplicarEnLote,
    contratosEnGrupoDuplicado,
    gruposDuplicados,
    porRevisar,
  };
}
