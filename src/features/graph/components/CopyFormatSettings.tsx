'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
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
  devDatasetMode?: 'sample' | 'miserables';
  onDevDatasetModeChange?: (mode: 'sample' | 'miserables') => void;
}

const copyFormats: Array<{ id: AsciiFormatId; label: string }> = [
  { id: 'indented-tree', label: 'Indented Tree' },
  { id: 'topological-list', label: 'Dependency List' },
  { id: 'mermaid', label: 'Mermaid' },
  { id: 'ascii-box-art', label: 'Box Art' },
];

export function CopyFormatSettings({
  visible,
  onClose,
  nodeRadius,
  onNodeRadiusChange,
  arrowMode,
  onArrowModeChange,
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
      <DialogContent className="max-w-xs" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Copy format */}
          <div>
            <div className="text-xs text-white/50 mb-1">Copy format</div>
            <div className="flex flex-wrap gap-1">
              {copyFormats.map((f) => (
                <Button
                  key={f.id}
                  variant={activeFormat === f.id ? 'default' : 'ghost'}
                  size="xs"
                  className="rounded-sm"
                  onClick={() => handleSelect(f.id)}
                >
                  {f.label}
                </Button>
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
