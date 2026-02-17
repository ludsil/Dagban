'use client';

import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Category } from '@/lib/types';
import { STANDARD_COLORS } from '@/lib/colors';
import { X } from 'lucide-react';

interface ColorPickerDotProps {
  color: string;
  onChange: (color: string) => void;
}

function ColorPickerDot({ color, onChange }: ColorPickerDotProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="catmgr-color-picker">
      <button
        className="catmgr-dot-btn"
        onClick={() => setOpen(p => !p)}
        aria-label="Pick color"
      >
        <span className="catmgr-dot" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <div className="catmgr-color-grid">
          {STANDARD_COLORS.map(sc => (
            <button
              key={sc.id}
              className={`catmgr-grid-swatch${sc.color === color ? ' active' : ''}`}
              onClick={() => {
                onChange(sc.color);
                setOpen(false);
              }}
              aria-label={sc.name}
            >
              <span className="catmgr-grid-dot" style={{ backgroundColor: sc.color }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CategoryManagerProps {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
}

export function CategoryManager({
  visible,
  onClose,
  categories,
  onCategoryAdd,
  onCategoryDelete,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(STANDARD_COLORS[0].color);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  const handleAdd = () => {
    if (!newName.trim() || !onCategoryAdd) return;
    const id = newName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    onCategoryAdd({ id, name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(STANDARD_COLORS[0].color);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="catmgr-dialog">
        <DialogHeader className="catmgr-header">
          <DialogTitle className="catmgr-title">Categories</DialogTitle>
        </DialogHeader>

        {categories.length > 0 ? (
          <div className="catmgr-list">
            {categories.map(cat => (
              <div key={cat.id} className="catmgr-row">
                <span className="catmgr-dot" style={{ backgroundColor: cat.color }} />
                <span className="catmgr-name">{cat.name}</span>
                {onCategoryDelete && (
                  <button
                    className="catmgr-delete"
                    onClick={() => onCategoryDelete(cat.id)}
                    aria-label={`Delete ${cat.name}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="catmgr-empty">No categories yet</p>
        )}

        <div className="catmgr-add" onClick={(e) => e.stopPropagation()}>
          <div className="catmgr-add-row">
            <ColorPickerDot color={newColor} onChange={setNewColor} />
            <input
              ref={inputRef}
              className="catmgr-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="New category"
            />
            <button
              className="catmgr-add-btn"
              onClick={handleAdd}
              disabled={!newName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
