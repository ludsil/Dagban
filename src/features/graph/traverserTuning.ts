export type TraverserTuning = {
  detachAngleDeg: number;
  detachDistanceMultiplier: number;
  detachDistanceBoost: number;
  minPerpDetachPx: number;
  magnetStrength: {
    detachTarget: number;
    detachFree: number;
    ghostTarget: number;
    ghostFree: number;
  };
  dragEdgeSearchRadius: number;
  ghostEdgeSearchRadius: number;
  rootSnapMultiplier: {
    balls: number;
    labels: number;
  };
};

export const defaultTraverserTuning: TraverserTuning = {
  detachAngleDeg: 78,
  detachDistanceMultiplier: 1.4,
  detachDistanceBoost: 3.1,
  minPerpDetachPx: 26,
  magnetStrength: {
    detachTarget: 0.4,
    detachFree: 0.2,
    ghostTarget: 0.3,
    ghostFree: 0.18,
  },
  dragEdgeSearchRadius: 18,
  ghostEdgeSearchRadius: 24,
  rootSnapMultiplier: {
    balls: 2,
    labels: 3.2,
  },
};
