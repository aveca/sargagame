"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Funnel,
  Table2,
  CreditCard,
  FileSearch,
  ScrollText,
  Rocket,
  Share2,
} from "lucide-react";

const LINKS = [
  { href: "/", label: "War Room", icon: LayoutDashboard },
  { href: "/session", label: "Session", icon: Rocket },
  { href: "/paywall", label: "Paywall ★", icon: Funnel },
  { href: "/backlog", label: "Backlog ROI", icon: Table2 },
  { href: "/stripe", label: "Dette Stripe", icon: CreditCard },
  { href: "/rapports", label: "Rapports", icon: FileSearch },
  { href: "/master-audit", label: "Master Audit", icon: ScrollText },
  { href: "/export", label: "Export", icon: Share2 },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b hairline bg-[#05070a]/85 backdrop-blur-md no-print">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-5 sm:px-8 py-3">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#c9f158] font-bold text-[#05070a] text-sm tracking-tighter">
            S·
          </span>
          <span className="font-semibold tracking-tight text-sm">
            SARGA<span className="text-[#c9f158]">·OPS</span>
          </span>
          <span className="chip hidden md:inline-block">war room</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto ml-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[#c9f158]/10 text-[#c9f158]"
                    : "text-[#8a93a1] hover:text-[#ecefe9] hover:bg-white/5"
                }`}
              >
                <Icon size={13} strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
