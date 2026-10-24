import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-4">
      <ComingSoon
        title="This week"
        icon="leaderboard"
        line="The weekly board lands soon. Rack up points now so you open in first."
      />
      <ButtonLink href="/friends">
        <span className="material-symbol text-xl" aria-hidden>
          person_add
        </span>
        Add your rivals
      </ButtonLink>
    </div>
  );
}
