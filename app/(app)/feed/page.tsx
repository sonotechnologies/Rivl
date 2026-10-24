import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
  return (
    <ComingSoon title="Feed" icon="dynamic_feed" line="Your crew's wins show up here soon. Give them something to react to." />
  );
}
