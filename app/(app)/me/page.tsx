import type { Metadata } from "next";
import { MeScreen } from "./me-screen";

export const metadata: Metadata = { title: "Me" };

export default function MePage() {
  return <MeScreen />;
}
