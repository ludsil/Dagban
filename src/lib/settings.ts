import type { AsciiFormatId } from '@/features/graph/ascii';
import type { ViewMode, DisplayMode, ArrowMode } from '@/features/graph/types';

const SETTINGS_KEY = 'dagban:settings';

interface DagbanSettings {
  copyFormat: AsciiFormatId;
  viewMode: ViewMode;
  displayMode: DisplayMode;
  arrowMode: ArrowMode;
  nodeRadius: number;
  scaleByIndegree: boolean;
}

const defaults: DagbanSettings = {
  copyFormat: 'indented-tree',
  viewMode: '2D',
  displayMode: 'balls',
  arrowMode: 'end',
  nodeRadius: 6,
  scaleByIndegree: false,
};

function load(): DagbanSettings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function save(settings: DagbanSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function update(patch: Partial<DagbanSettings>): void {
  save({ ...load(), ...patch });
}

export function getCopyFormat(): AsciiFormatId { return load().copyFormat; }
export function setCopyFormat(format: AsciiFormatId): void { update({ copyFormat: format }); }

export function getViewMode(): ViewMode { return load().viewMode; }
export function setViewMode(mode: ViewMode): void { update({ viewMode: mode }); }

export function getDisplayMode(): DisplayMode { return load().displayMode; }
export function setDisplayMode(mode: DisplayMode): void { update({ displayMode: mode }); }

export function getArrowMode(): ArrowMode { return load().arrowMode; }
export function setArrowMode(mode: ArrowMode): void { update({ arrowMode: mode }); }

export function getNodeRadius(): number { return load().nodeRadius; }
export function setNodeRadius(radius: number): void { update({ nodeRadius: radius }); }

export function getScaleByIndegree(): boolean { return load().scaleByIndegree; }
export function setScaleByIndegree(enabled: boolean): void { update({ scaleByIndegree: enabled }); }
