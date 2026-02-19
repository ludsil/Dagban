'use client';

import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Category } from '@/lib/types';
import { STANDARD_COLORS } from '@/lib/colors';
import { Pencil, Trash2, Check, X } from 'lucide-react';

interface ColorPickerDotProps {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPickerDot({ color, onChange }: ColorPickerDotProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="catmgr-dot-btn"
          aria-label="Pick color"
        >
          <span className="catmgr-dot" style={{ backgroundColor: color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="catmgr-color-popover"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
      </PopoverContent>
    </Popover>
  );
}

interface CategoryManagerProps {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
  /** When provided, category rows become clickable to select */
  selectedCategoryId?: string;
  onSelect?: (categoryId: string) => void;
}

export function CategoryManager({
  visible,
  onClose,
  categories,
  onCategoryAdd,
  onCategoryDelete,
  onCategoryChange,
  selectedCategoryId,
  onSelect,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(STANDARD_COLORS[0].color);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  useEffect(() => {
    if (editingId) {
      requestAnimationFrame(() => {
        renameRef.current?.focus();
        renameRef.current?.select();
      });
    }
  }, [editingId]);

  const handleAdd = () => {
    if (!newName.trim() || !onCategoryAdd) return;
    const id = newName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    onCategoryAdd({ id, name: newName.trim(), color: newColor });
    if (onSelect) {
      onSelect(id);
      onClose();
    }
    setNewName('');
    setNewColor(STANDARD_COLORS[0].color);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleRenameCommit = () => {
    if (editingId && editingName.trim() && onCategoryChange) {
      onCategoryChange(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleRenameCancel = () => {
    setEditingId(null);
    setEditingName('');
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
              <div
                key={cat.id}
                className={`catmgr-row${onSelect ? ' catmgr-row-selectable' : ''}${selectedCategoryId === cat.id ? ' catmgr-row-selected' : ''}`}
                onClick={onSelect && editingId !== cat.id ? () => { onSelect(cat.id); onClose(); } : undefined}
              >
                <ColorPickerDot
                  color={cat.color}
                  onChange={(color) => onCategoryChange?.(cat.id, { color })}
                />
                {editingId === cat.id ? (
                  <>
                    <input
                      ref={renameRef}
                      className="catmgr-rename-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') handleRenameCommit();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      onBlur={handleRenameCommit}
                    />
                    <button
                      className="catmgr-action-btn catmgr-confirm-btn"
                      onClick={handleRenameCommit}
                      aria-label="Confirm rename"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      className="catmgr-action-btn catmgr-cancel-btn"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleRenameCancel}
                      aria-label="Cancel rename"
                    >
                      <X className="size-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="catmgr-name">{cat.name}</span>
                    <button
                      className="catmgr-action-btn catmgr-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      aria-label={`Rename ${cat.name}`}
                    >
                      <Pencil className="size-3" />
                    </button>
                    {onCategoryDelete && (
                      <button
                        className="catmgr-action-btn catmgr-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCategoryDelete(cat.id);
                        }}
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </>
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
