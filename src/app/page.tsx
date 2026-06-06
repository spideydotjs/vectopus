"use client";

import dynamic from "next/dynamic";

const Vetopus = dynamic(
  () => import("@/components/Vetopus").then((mod) => mod.Vetopus),
  { ssr: false },
);

export default function Home() {
  return <Vetopus />;
}
