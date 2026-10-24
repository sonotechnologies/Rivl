"use client";

import { usePathname } from "next/navigation";
import { BoardView } from "./board-view";

/** At 1024 px and up, the board sits beside the app column (design 1g). */
export function DesktopBoard() {
  const pathname = usePathname();
  if (pathname.startsWith("/board")) return null;
  return (
    <aside aria-label="This week's board" className="sticky top-3 hidden max-h-[calc(100dvh-24px)] overflow-y-auto rounded-sheet border border-line bg-surface p-5 lg:block">
      <BoardView compact />
    </aside>
  );
}
