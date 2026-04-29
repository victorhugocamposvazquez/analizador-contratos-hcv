"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

/**
 * Mantiene al día listados y badges (layout) mediante:
 * - Realtime Postgres (instantáneo si las tablas están en publication `supabase_realtime`)
 * - Polling cuando la pestaña está visible (lotes algo más rápido)
 * - Refresh al volver a la pestaña
 */
export default function ContractsLiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  /** Pantallas donde la cola evoluciona rápido: polling más corto como respaldo al Realtime */
  const queuesPath =
    pathname === "/contracts/batches" ||
    (pathname.startsWith("/contracts/batches/") &&
      pathname !== "/contracts/batches") ||
    pathname === "/contracts/review" ||
    pathname === "/contracts/dnis" ||
    pathname.startsWith("/contracts/dnis/");
  const pollMs = queuesPath ? 3200 : 6500;

  const scheduleRefresh = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.refresh();
    }, 280);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("contracts-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contracts" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batches" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dni_batches" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dni_jobs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dni_extractions" },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[ContractsLiveRefresh] Realtime limitado — sigue funcionando el intervalo automático."
          );
        }
      });

    return () => {
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    const interval = setInterval(scheduleRefresh, pollMs);
    return () => clearInterval(interval);
  }, [pollMs, scheduleRefresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [scheduleRefresh]);

  return null;
}
