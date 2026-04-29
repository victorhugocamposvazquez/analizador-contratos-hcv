"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresco suave cuando aún hay jobs pendientes/en proceso. */
export default function DniBatchLiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 9500);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
