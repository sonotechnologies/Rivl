import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage() {
  return (
    <ComingSoon
      title="This week"
      icon="leaderboard"
      line="The weekly board lands soon. Rack up points now so you open in first."
    />
  );
}
