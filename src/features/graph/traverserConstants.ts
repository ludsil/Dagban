export const ROOT_TRAVERSER_PREFIX = 'root:';

/** Multiplier to convert fuseAnimationTime (ms) to a 0–1 phase for gradient cycling. */
export const FUSE_ANIMATION_PHASE_SCALE = 0.00018;

export type FuseGradientStop = { stop: number; color: string };

/**
 * Shift gradient stops by a phase offset (0–1) so the gradient appears to cycle.
 * Pure function — used by both 2D (useGraphCoordinates) and 3D (useThreeTraverserRendering).
 */
export function getShiftedGradientStops(
  stops: FuseGradientStop[],
  phase: number,
): FuseGradientStop[] {
  const epsilon = 0.0001;
  let startIndex = stops.findIndex(s => s.stop >= phase);
  if (startIndex === -1) startIndex = 0;
  const rotated = [...stops.slice(startIndex), ...stops.slice(0, startIndex)].map(s => {
    let shifted = s.stop - phase;
    if (shifted < 0) shifted += 1;
    return { stop: shifted, color: s.color };
  });
  const output: FuseGradientStop[] = [];
  const first = rotated[0];
  const last = rotated[rotated.length - 1];
  if (first.stop > epsilon) {
    output.push({ stop: 0, color: last.color });
  }
  output.push(...rotated);
  if (last.stop < 1 - epsilon) {
    output.push({ stop: 1, color: first.color });
  }
  return output;
}
