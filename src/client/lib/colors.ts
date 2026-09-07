export const PALETTE = [
  "#c4b454",
  "#3d8a8a",
  "#7c6a9a",
  "#c47a54",
  "#5a8f5a",
  "#8a5a7a",
  "#5a7aa8",
  "#a88a4a",
];

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
