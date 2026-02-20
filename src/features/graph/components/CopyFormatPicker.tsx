'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AsciiFormatId } from '../ascii';

interface CopyFormatPickerProps {
  visible: boolean;
  onClose: () => void;
  onCopy: (formatId: AsciiFormatId) => void;
}

const formats: Array<{ id: AsciiFormatId; label: string; description: string }> = [
  { id: 'indented-tree', label: 'Indented Tree', description: 'Hierarchical view with branch connectors' },
  { id: 'topological-list', label: 'Dependency List', description: 'Each node with its downstream targets' },
  { id: 'mermaid', label: 'Mermaid', description: 'Renders as a diagram in Obsidian / GitHub' },
  { id: 'ascii-box-art', label: 'Box Art', description: 'Boxes with arrows between layers' },
];

export function CopyFormatPicker({ visible, onClose, onCopy }: CopyFormatPickerProps) {
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Copy Graph as Text</DialogTitle>
          <DialogDescription>Pick a format to copy to clipboard.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {formats.map((f) => (
            <Button
              key={f.id}
              variant="ghost"
              className="h-auto justify-start px-3 py-2"
              onClick={() => onCopy(f.id)}
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-xs text-white/50">{f.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
