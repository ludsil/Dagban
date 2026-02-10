'use client';

interface KeyboardShortcutsHelpProps {
  visible: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ visible, onClose }: KeyboardShortcutsHelpProps) {
  if (!visible) return null;

  return (
    <div className="shortcuts-help">
      <div className="shortcuts-help-header">
        <span>Keyboard Shortcuts</span>
        <button className="shortcuts-help-close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="shortcuts-help-list">
        <div className="shortcut-item">
          <kbd>Cmd</kbd>+<kbd>Z</kbd>
          <span>Undo last action</span>
        </div>
        <div className="shortcut-item">
          <kbd>Cmd</kbd>+<kbd>K</kbd>
          <span>Open command palette</span>
        </div>
        <div className="shortcut-item">
          <kbd>?</kbd>
          <span>Show this help</span>
        </div>
      </div>
    </div>
  );
}
