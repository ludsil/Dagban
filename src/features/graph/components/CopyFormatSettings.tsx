'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCopyFormat, setCopyFormat } from '@/lib/settings';
import type { AsciiFormatId } from '../ascii';
import type { ArrowMode } from '../types';

interface SettingsDialogProps {
  visible: boolean;
  onClose: () => void;
  nodeRadius: number;
  onNodeRadiusChange: (radius: number) => void;
  arrowMode: ArrowMode;
  onArrowModeChange: (mode: ArrowMode) => void;
  scaleByIndegree: boolean;
  onScaleByIndegreeChange: (enabled: boolean) => void;
  devDatasetMode?: 'sample' | 'miserables';
  onDevDatasetModeChange?: (mode: 'sample' | 'miserables') => void;
}

const copyFormats: Array<{ id: AsciiFormatId; label: string; preview: string }> = [
  {
    id: 'indented-tree',
    label: 'Indented Tree',
    preview: `Design
├── Build
│   └── Test
└── Docs`,
  },
  {
    id: 'topological-list',
    label: 'Dependency List',
    preview: `Design → Build, Docs
Build → Test
Test
Docs`,
  },
  {
    id: 'mermaid',
    label: 'Mermaid',
    preview: `graph TD
    A["Design"]
    B["Build"]
    A --> B
    A --> C`,
  },
  {
    id: 'ascii-box-art',
    label: 'Box Art',
    preview: `+------+
|Design|--+
+------+  |
   v      v
+-----+ +----+
|Build| |Docs|
+-----+ +----+`,
  },
];

export function CopyFormatSettings({
  visible,
  onClose,
  nodeRadius,
  onNodeRadiusChange,
  arrowMode,
  onArrowModeChange,
  scaleByIndegree,
  onScaleByIndegreeChange,
  devDatasetMode,
  onDevDatasetModeChange,
}: SettingsDialogProps) {
  const [activeFormat, setActiveFormat] = useState<AsciiFormatId>('indented-tree');

  useEffect(() => {
    if (visible) setActiveFormat(getCopyFormat());
  }, [visible]);

  const handleSelect = (id: AsciiFormatId) => {
    setCopyFormat(id);
    setActiveFormat(id);
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Copy format */}
          <div>
            <div className="text-xs text-white/50 mb-1.5">Copy format</div>
            <div className="grid grid-cols-2 grid-rows-[1fr_1fr] gap-1.5">
              {copyFormats.map((f) => (
                <button
                  key={f.id}
                  className={`rounded border px-2.5 py-2 text-left transition-colors ${
                    activeFormat === f.id
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10 bg-transparent hover:border-white/20 hover:bg-white/5'
                  }`}
                  onClick={() => handleSelect(f.id)}
                >
                  <div className="text-xs font-medium mb-1">{f.label}</div>
                  <pre className="text-[9px] leading-[1.3] text-white/40 font-mono overflow-hidden">{f.preview}</pre>
                </button>
              ))}
            </div>
          </div>

          {/* Node size */}
          <div>
            <div className="text-xs text-white/50 mb-1">Node size: {nodeRadius}</div>
            <input
              type="range"
              className="filter-slider w-full"
              min={4}
              max={8}
              value={nodeRadius}
              onChange={(e) => onNodeRadiusChange(parseInt(e.target.value))}
            />
          </div>

          {/* Scale by indegree */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scaleByIndegree}
                onChange={(e) => onScaleByIndegreeChange(e.target.checked)}
                className="accent-white/80"
              />
              <span className="text-xs text-white/50">Scale nodes by indegree</span>
            </label>
          </div>

          {/* Arrow position */}
          <div>
            <div className="text-xs text-white/50 mb-1">Arrow position</div>
            <div className="flex gap-1">
              {(['end', 'middle', 'none'] as ArrowMode[]).map(mode => (
                <Button
                  key={mode}
                  variant={arrowMode === mode ? 'default' : 'ghost'}
                  size="xs"
                  className="rounded-sm capitalize"
                  onClick={() => onArrowModeChange(mode)}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {/* Dataset (dev only) */}
          {devDatasetMode && onDevDatasetModeChange && (
            <div>
              <div className="text-xs text-white/50 mb-1">Dataset</div>
              <div className="flex gap-1">
                <Button
                  variant={devDatasetMode === 'sample' ? 'default' : 'ghost'}
                  size="xs"
                  className="rounded-sm"
                  onClick={() => onDevDatasetModeChange('sample')}
                >
                  Sample
                </Button>
                <Button
                  variant={devDatasetMode === 'miserables' ? 'default' : 'ghost'}
                  size="xs"
                  className="rounded-sm"
                  onClick={() => onDevDatasetModeChange('miserables')}
                >
                  Miserables
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
