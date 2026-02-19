// Modular color system for Dagban graph visualizations

/**
 * Standard color palette for card categories.
 */
export const STANDARD_COLORS: { id: string; name: string; color: string }[] = [
  { id: 'red', name: 'Red', color: '#C93A43' },
  { id: 'blue', name: 'Blue', color: '#335ED9' },
  { id: 'light-blue', name: 'Light Blue', color: '#41A6D8' },
  { id: 'purple', name: 'Purple', color: '#531972' },
  { id: 'yellow', name: 'Yellow', color: '#F2EA6E' },
  { id: 'dark-green', name: 'Dark Green', color: '#0C6144' },
  { id: 'orange', name: 'Orange', color: '#F8A041' },
  { id: 'green', name: 'Green', color: '#45A433' },
  { id: 'light-pink', name: 'Light Pink', color: '#DFC4FF' },
  { id: 'violet', name: 'Violet', color: '#34229A' },
  { id: 'light-grey', name: 'Light Grey', color: '#525492' },
  { id: 'brown', name: 'Brown', color: '#372A1D' },
  { id: 'light-green', name: 'Light Green', color: '#94FE8F' },
  { id: 'beige', name: 'Beige', color: '#F6EBD9' },
  { id: 'pink', name: 'Pink', color: '#E077B7' },
];

/**
 * Color scale definitions for different visualization modes.
 * Each scale is a tuple of [lightColor, darkColor] for gradient interpolation.
 */
export const colorScales = {
  indegree: ['#e0f2fe', '#0369a1'] as const,  // light sky blue to dark blue
  outdegree: ['#ffedd5', '#c2410c'] as const, // light orange to dark burnt orange
} as const;

export type ColorScaleKey = keyof typeof colorScales;

/**
 * Interpolate between two hex colors based on a ratio (0-1).
 */
function interpolateColor(color1: string, color2: string, ratio: number): string {
  // Clamp ratio between 0 and 1
  const t = Math.max(0, Math.min(1, ratio));

  // Parse hex colors
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  // Interpolate
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Get a gradient color from a scale based on value relative to max.
 *
 * @param scale - The color scale to use ('indegree' or 'outdegree')
 * @param value - The current value (e.g., number of connections)
 * @param max - The maximum value in the dataset
 * @returns A hex color string interpolated between the scale's light and dark colors
 *
 * @example
 * // Node with 2 incoming edges in a graph where max indegree is 5
 * getGradientColor('indegree', 2, 5); // Returns a blue between light and dark
 */
export function getGradientColor(scale: ColorScaleKey, value: number, max: number): string {
  const [lightColor, darkColor] = colorScales[scale];

  // If max is 0, return the light color (no connections)
  if (max === 0) {
    return lightColor;
  }

  const ratio = value / max;
  return interpolateColor(lightColor, darkColor, ratio);
}

/**
 * Get contrast-aware text/UI colors for a given background hex color.
 * Saturated/dark backgrounds get light text; light backgrounds get dark text.
 * Body copy is always a softened alpha version of the heading color.
 */
export function getContrastColors(bgHex: string): {
  title: string;
  body: string;
  muted: string;
  actionBorder: string;
  actionText: string;
  badgeBg: string;
} {
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  // Perceived luminance (ITU-R BT.601)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.55;

  if (isLight) {
    return {
      title: 'rgba(0, 0, 0, 0.85)',
      body: 'rgba(0, 0, 0, 0.6)',
      muted: 'rgba(0, 0, 0, 0.35)',
      actionBorder: 'rgba(0, 0, 0, 0.15)',
      actionText: 'rgba(0, 0, 0, 0.6)',
      badgeBg: 'rgba(0, 0, 0, 0.1)',
    };
  } else {
    return {
      title: 'rgba(255, 255, 255, 0.95)',
      body: 'rgba(255, 255, 255, 0.7)',
      muted: 'rgba(255, 255, 255, 0.35)',
      actionBorder: 'rgba(255, 255, 255, 0.2)',
      actionText: 'rgba(255, 255, 255, 0.7)',
      badgeBg: 'rgba(255, 255, 255, 0.15)',
    };
  }
}

/**
 * Compute indegree (number of incoming edges) for each node.
 *
 * @param edges - Array of edges with source and target properties
 * @returns A Map from node ID to indegree count
 */
export function computeIndegrees(edges: { source: string; target: string }[]): Map<string, number> {
  const indegrees = new Map<string, number>();

  for (const edge of edges) {
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as { id: string }).id;
    indegrees.set(targetId, (indegrees.get(targetId) || 0) + 1);
  }

  return indegrees;
}

/**
 * Compute outdegree (number of outgoing edges) for each node.
 *
 * @param edges - Array of edges with source and target properties
 * @returns A Map from node ID to outdegree count
 */
export function computeOutdegrees(edges: { source: string; target: string }[]): Map<string, number> {
  const outdegrees = new Map<string, number>();

  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as { id: string }).id;
    outdegrees.set(sourceId, (outdegrees.get(sourceId) || 0) + 1);
  }

  return outdegrees;
}

/**
 * Get the maximum value from a degree map.
 */
export function getMaxDegree(degrees: Map<string, number>): number {
  let max = 0;
  for (const value of degrees.values()) {
    if (value > max) {
      max = value;
    }
  }
  return max;
}
