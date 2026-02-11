'use client';

import { User } from '@/lib/types';
import { Plus } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { UserAvatar } from './UserAvatar';

interface UserStackProps {
  users: User[];
  selectedUserIds?: Set<string>;
  onUserToggle?: (userId: string) => void;
  onAddUser?: () => void;
  onUserDragStart?: (userId: string) => void;
  onUserDragEnd?: () => void;
}

export function UserStack({
  users,
  selectedUserIds,
  onUserToggle,
  onAddUser,
  onUserDragStart,
  onUserDragEnd,
}: UserStackProps) {
  const userList = useMemo(() => users, [users]);

  return (
    <div className="user-stack" title="Project users">
      {userList.map((user, index) => {
        const isActive = selectedUserIds?.has(user.id) ?? false;
        return (
          <button
            key={user.id}
            type="button"
            className={`user-stack-item ${isActive ? 'active' : ''}`}
            style={{ ['--stack-index' as string]: index } as CSSProperties}
            onClick={() => onUserToggle?.(user.id)}
            title={user.name}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/dagban-user', user.id);
              event.dataTransfer.effectAllowed = 'copy';
              onUserDragStart?.(user.id);
            }}
            onDragEnd={() => onUserDragEnd?.()}
          >
            <UserAvatar user={user} size="sm" />
          </button>
        );
      })}
      <button
        type="button"
        className="user-stack-item user-stack-add"
        style={{ ['--stack-index' as string]: userList.length } as CSSProperties}
        onClick={onAddUser}
        title="Add user"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
