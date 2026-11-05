export const colorways = [
  {
    id: "grove",
    name: "Grove",
    description: "Fresh greens, familiar calm",
    color: "#d3e9a5",
    dark: "#101611",
    light: "#f7f9f3",
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool blue, a deeper focus",
    color: "#99cfff",
    dark: "#0d151f",
    light: "#f3f8fd",
  },
  {
    id: "orchid",
    name: "Orchid",
    description: "Soft violet, a creative mood",
    color: "#cbb2ff",
    dark: "#171220",
    light: "#f8f5fd",
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm pinks, an easy evening",
    color: "#ffb7c8",
    dark: "#1d1218",
    light: "#fdf5f7",
  },
  {
    id: "ember",
    name: "Ember",
    description: "Amber light, a warmer space",
    color: "#f7c486",
    dark: "#1c1510",
    light: "#fcf7f0",
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Quiet contrast, all essentials",
    color: "#d2d6df",
    dark: "#121316",
    light: "#f6f7f9",
  },
] as const;
export type Colorway = (typeof colorways)[number]["id"];
export function readColorway(): Colorway {
  try {
    const stored = localStorage.getItem("frame-colorway");
    return colorways.find((item) => item.id === stored)?.id ?? "grove";
  } catch {
    return "grove";
  }
}
