import type { AsciiFormatId } from '@/features/graph/ascii';

const SETTINGS_KEY = 'dagban:settings';

interface DagbanSettings {
  copyFormat: AsciiFormatId;
}

const defaults: DagbanSettings = {
  copyFormat: 'indented-tree',
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

export function getCopyFormat(): AsciiFormatId {
  return load().copyFormat;
}

export function setCopyFormat(format: AsciiFormatId): void {
  const settings = load();
  settings.copyFormat = format;
  save(settings);
}
