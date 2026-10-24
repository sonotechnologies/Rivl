"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LEFT = [
  { href: "/today", icon: "today", label: "Today" },
  { href: "/board", icon: "leaderboard", label: "Board" },
];
const RIGHT = [
  { href: "/feed", icon: "dynamic_feed", label: "Feed" },
  { href: "/me", icon: "person", label: "Me" },
];

/** Four tabs plus the raised accent "+" in the middle. */
export function BottomNav({ onAdd }: { onAdd?: () => void }) {
  return <NavBar pathname={usePathname()} onAdd={onAdd} />;
}

/** The bar alone, for loading states where the URL can't be read yet. */
export function NavBar({ pathname, onAdd }: { pathname?: string; onAdd?: () => void }) {
  const tab = ({ href, icon, label }: (typeof LEFT)[number]) => {
    const on = pathname !== undefined && (pathname === href || pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold ${on ? "text-accent-text" : "text-muted"}`}
      >
        <span className={`material-symbol text-2xl ${on ? "" : "icon-outline"}`} aria-hidden>
          {icon}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-[480px] lg:left-[calc(50%-440px)] lg:right-auto lg:mx-0 grid-cols-5 items-center justify-items-center border-t border-line bg-surface px-3 pt-1 pb-[max(18px,env(safe-area-inset-bottom))]"
    >
      {LEFT.map(tab)}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Quick add"
        className="-mt-[30px] grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_0_6px_var(--bg)] active:scale-95"
      >
        <span className="material-symbol text-[1.875rem] [font-variation-settings:'wght'_600]" aria-hidden>
          add
        </span>
      </button>
      {RIGHT.map(tab)}
    </nav>
  );
}
