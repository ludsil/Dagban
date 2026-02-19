'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from '@/lib/types';
import { STANDARD_COLORS } from '@/lib/colors';

interface UserEditDialogProps {
  visible: boolean;
  onClose: () => void;
  user: User;
  onSave: (userId: string, updates: Partial<User>) => void;
}

export function UserEditDialog({ visible, onClose, user, onSave }: UserEditDialogProps) {
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color || STANDARD_COLORS[0].color);
  const [avatar, setAvatar] = useState(user.avatar || '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setName(user.name);
      setColor(user.color || STANDARD_COLORS[0].color);
      setAvatar(user.avatar || '');
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [visible, user]);

  const handleSave = () => {
    if (!name.trim()) return;
    const updates: Partial<User> = { name: name.trim(), color };
    if (avatar.trim()) {
      updates.avatar = avatar.trim();
    } else {
      updates.avatar = undefined;
    }
    onSave(user.id, updates);
    onClose();
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="user-edit-dialog">
        <DialogHeader className="catmgr-header">
          <DialogTitle className="catmgr-title">Edit User</DialogTitle>
        </DialogHeader>

        <div className="user-edit-field">
          <label className="user-edit-label">Name</label>
          <input
            ref={nameRef}
            className="user-edit-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="User name"
          />
        </div>

        <div className="user-edit-field">
          <label className="user-edit-label">Color</label>
          <div className="user-edit-colors">
            {STANDARD_COLORS.map((sc) => (
              <button
                key={sc.id}
                className={`user-edit-color-dot${sc.color === color ? ' active' : ''}`}
                style={{ backgroundColor: sc.color }}
                onClick={() => setColor(sc.color)}
                aria-label={sc.name}
              />
            ))}
          </div>
        </div>

        <div className="user-edit-field">
          <label className="user-edit-label">Avatar URL</label>
          <input
            className="user-edit-input"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="Paste avatar URL..."
          />
        </div>

        <div className="user-edit-actions">
          <button className="catmgr-add-btn" onClick={onClose} style={{ opacity: 0.7 }}>
            Cancel
          </button>
          <button
            className="catmgr-add-btn"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
