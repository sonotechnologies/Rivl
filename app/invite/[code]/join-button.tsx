"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { joinViaInvite, type JoinResult } from "./actions";

const MESSAGES: Partial<Record<JoinResult, string>> = {
  self: "That's your own invite. Send it to a friend instead.",
  blocked: "This invite isn't available.",
  invalid: "This invite link doesn't work.",
  error: "Couldn't join just now. Try again.",
};

/** Joins via the invite. With `auto`, it runs straight away (coming back from sign-in). */
export function JoinButton({ code, name, auto }: { code: string; name: string; auto: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<JoinResult | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  const join = () =>
    start(async () => {
      const r = await joinViaInvite(code);
      if (r === "signed_out") return router.push(`/login?next=${encodeURIComponent(`/invite/${code}?join=1`)}`);
      setResult(r);
    });

  useEffect(() => {
    if (auto && !ran.current) {
      ran.current = true;
      join();
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  if (result === "joined" || result === "joined_bonus") {
    return (
      <div className="flex flex-col gap-3 text-center" role="status">
        <p className="font-display text-title font-bold">
          You and {name} are rivals now.{result === "joined_bonus" ? " +100 points each." : ""}
        </p>
        <Button onClick={() => router.push("/today")} className="h-14">
          Let&apos;s go
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={join} disabled={pending} className="h-14">
        {pending ? "Joining…" : `Join ${name} on Rivl`}
      </Button>
      {result && MESSAGES[result] ? (
        <p role="alert" className="text-center text-body-sm text-danger">
          {MESSAGES[result]}
        </p>
      ) : null}
    </div>
  );
}
