import { createFileRoute } from "@tanstack/react-router";
import { Vetopus } from "@/components/Vetopus";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "vetopus — png to svg converter" },
      {
        name: "description",
        content:
          "Vetopus turns PNG images into scalable SVG vectors right in your browser. PNG goes in. SVG comes out.",
      },
      { property: "og:title", content: "vetopus — png to svg converter" },
      {
        property: "og:description",
        content: "PNG goes in. SVG comes out. Client-side raster → vector.",
      },
    ],
  }),
  component: Vetopus,
});
