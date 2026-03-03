"use client";

import dynamic from "next/dynamic";

const OrthoApp = dynamic(() => import("@/components/OrthoApp"), {
  ssr: false,
});

export default function Home() {
  return <OrthoApp />;
}
