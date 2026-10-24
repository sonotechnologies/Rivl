import type { Metadata } from "next";
import { TaskDetail } from "./task-detail";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/task/[id]">) {
  const { id } = await params;
  return <TaskDetail id={id} />;
}
