import type { MetadataRoute } from "next";

// Installable on iPhone / Android home screens ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SaaS Opportunity Radar",
    short_name: "SOR",
    description: "Découvre chaque jour de vrais SaaS et les opportunités qu’ils révèlent.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
