import type { Metadata } from "next";
import { TodayScreen } from "../today/today-screen";
import { OpenQuickAdd } from "./open-quick-add";

export const metadata: Metadata = { title: "Quick add" };

// /add is Today with the quick-add sheet already open (home-screen shortcut, share links).
export default function AddPage() {
  return (
    <>
      <TodayScreen />
      <OpenQuickAdd />
    </>
  );
}
