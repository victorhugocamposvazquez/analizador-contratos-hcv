"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BatchAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
