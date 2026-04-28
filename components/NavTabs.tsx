"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs({
  reviewCount,
  jobsActive,
}: {
  reviewCount: number;
  jobsActive: number;
}) {
  const path = usePathname();
  const tabs = [
    { href: "/contracts", label: "Listado" },
    {
      href: "/contracts/review",
      label: "Por revisar",
      badge: reviewCount > 0 ? reviewCount : null,
    },
    {
      href: "/contracts/batches",
      label: "Lotes",
      badge: jobsActive > 0 ? `${jobsActive} en cola` : null,
    },
  ];
  return (
    <nav className="max-w-6xl mx-auto px-6 flex gap-1 text-sm">
      {tabs.map((t) => {
        const active =
          t.href === "/contracts"
            ? path === "/contracts"
            : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 -mb-px border-b-2 ${
              active
                ? "border-slate-900 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs">
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
