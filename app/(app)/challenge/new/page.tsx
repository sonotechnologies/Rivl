import type { Metadata } from "next";
import { NewChallenge } from "./new-challenge";

export const metadata: Metadata = { title: "New challenge" };

export default function NewChallengePage() {
  return <NewChallenge />;
}
