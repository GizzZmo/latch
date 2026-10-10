import { createFileRoute } from "@tanstack/react-router";
import { LatchRack } from "@/components/latch-rack";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <LatchRack />;
}
