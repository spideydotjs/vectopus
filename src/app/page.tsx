"use client";

import dynamic from "next/dynamic";

const Vectopus = dynamic(() => import("@/components/Vectopus").then((mod) => mod.Vectopus), {
  ssr: false,
});

export default function Home() {
  return <Vectopus />;
}
