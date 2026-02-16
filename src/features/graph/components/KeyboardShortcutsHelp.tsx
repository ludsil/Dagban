'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface KeyboardShortcutsHelpProps {
  visible: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ visible, onClose }: KeyboardShortcutsHelpProps) {
  const shortcuts: { keys: string[]; action: string; context?: string; separator?: string }[] = [
    { keys: ['M'], action: 'Hotkey map' },
    { keys: ['N'], action: 'New blank root node' },
    { keys: ['/'], action: 'Search' },
    { keys: ['Cmd/Ctrl', 'Z'], action: 'Undo' },
    { keys: ['Shift', 'Click'], action: 'Connect selected → clicked node', separator: '+' },
    { keys: ['Space'], action: 'Hold to show free edges & nodes' },
    { keys: ['Esc'], action: 'Deselect node' },
  ];

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hotkeys</DialogTitle>
          <DialogDescription>
            Press <kbd className="mx-1 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] text-white/90">M</kbd>
            to open or close this map.
          </DialogDescription>
        </DialogHeader>
        <div className="shortcuts-help-list">
          {shortcuts.map((shortcut) => (
            <div
              key={`${shortcut.keys.join('+')}:${shortcut.action}:${shortcut.context ?? 'base'}`}
              className="shortcut-item"
            >
              <div className="shortcut-meta">
                <span className="shortcut-action">{shortcut.action}</span>
                {shortcut.context && <span className="shortcut-context">{shortcut.context}</span>}
              </div>
              <div className="shortcut-keys">
                {shortcut.keys.map((key, index) => (
                  <span key={`${shortcut.action}:${key}:${index}`} className="flex items-center gap-1.5">
                    {index > 0 && <span className="text-white/35">{shortcut.separator ?? '+'}</span>}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
