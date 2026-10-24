import type { Metadata } from "next";
import { FriendsScreen } from "./friends-screen";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage() {
  return <FriendsScreen />;
}
