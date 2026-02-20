'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/avatar';
import { User } from '@/lib/types';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  user?: User | null;
  name?: string;
  size?: 'xs' | 'sm' | 'default' | 'lg';
  className?: string;
  showPlaceholderIcon?: boolean;
}

export function UserAvatar({
  user,
  name,
  size = 'sm',
  className,
  showPlaceholderIcon = true,
}: UserAvatarProps) {
  const displayName = (user?.name || name || '').trim();
  const initials = displayName ? getInitials(displayName) : '';

  return (
    <Avatar size={size} className={className}>
      {user?.avatar ? (
        <AvatarImage src={user.avatar} alt={displayName || 'User'} />
      ) : (
        <AvatarFallback>
          {initials ? initials : showPlaceholderIcon ? <UserIcon className="size-3" /> : null}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
