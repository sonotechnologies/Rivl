import type { Metadata } from "next";
import { BoardScreen } from "./board-screen";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage() {
  return <BoardScreen />;
}
