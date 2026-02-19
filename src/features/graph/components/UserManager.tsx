'use client';

import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User } from '@/lib/types';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface UserManagerProps {
  visible: boolean;
  onClose: () => void;
  users: User[];
  onUserAdd?: (name: string) => void;
  onUserDelete?: (userId: string) => void;
  onUserChange?: (userId: string, updates: Partial<User>) => void;
}

export function UserManager({
  visible,
  onClose,
  users,
  onUserAdd,
  onUserDelete,
  onUserChange,
}: UserManagerProps) {
  const [newName, setNewName] = useState('');
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
    if (!newName.trim() || !onUserAdd) return;
    onUserAdd(newName.trim());
    setNewName('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleRenameCommit = () => {
    if (editingId && editingName.trim() && onUserChange) {
      onUserChange(editingId, { name: editingName.trim() });
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
          <DialogTitle className="catmgr-title">Users</DialogTitle>
        </DialogHeader>

        {users.length > 0 ? (
          <div className="catmgr-list">
            {users.map(user => (
              <div key={user.id} className="catmgr-row">
                <UserAvatar user={user} size="sm" />
                {editingId === user.id ? (
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
                    <span className="catmgr-name">{user.name}</span>
                    <button
                      className="catmgr-action-btn catmgr-edit-btn"
                      onClick={() => {
                        setEditingId(user.id);
                        setEditingName(user.name);
                      }}
                      aria-label={`Rename ${user.name}`}
                    >
                      <Pencil className="size-3" />
                    </button>
                    {onUserDelete && (
                      <button
                        className="catmgr-action-btn catmgr-delete-btn"
                        onClick={() => onUserDelete(user.id)}
                        aria-label={`Delete ${user.name}`}
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
          <p className="catmgr-empty">No users yet</p>
        )}

        <div className="catmgr-add" onClick={(e) => e.stopPropagation()}>
          <div className="catmgr-add-row">
            <input
              ref={inputRef}
              className="catmgr-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="New user"
              style={{ flex: 1 }}
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
