"use client";

import { useState } from "react";
import { BoardView, PinnedMe } from "@/components/board/board-view";

export function BoardScreen() {
  const [meVisible, setMeVisible] = useState(true);
  return (
    <>
      <BoardView onMeVisible={setMeVisible} />
      {meVisible ? null : <PinnedMe />}
    </>
  );
}
