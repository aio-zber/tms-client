'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Conversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive?: boolean;
  currentUserId?: string;
}

// Helper function to get initials from a name string
const getNameInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
};

// Helper function to get conversation display name
const getConversationDisplayName = (
  conversation: Conversation,
  currentUserId?: string
): string => {
  // For group conversations, use the group name
  if (conversation.type === 'group') {
    return conversation.name || 'Group Chat';
  }

  // For DM conversations, get the other user's name
  if (!conversation.members || conversation.members.length === 0) {
    return 'Direct Message';
  }

  const otherMember = conversation.members.find(
    (m) => m.userId !== currentUserId
  );

  if (!otherMember) return 'Direct Message';

  // Check if member has enriched user data from backend
  const memberData = otherMember as unknown as Record<string, unknown>;
  const userData = memberData.user as Record<string, unknown> | undefined;

  if (userData) {
    // Try to get full name from various fields
    const firstName = userData.firstName || userData.first_name || '';
    const middleName = userData.middleName || userData.middle_name || '';
    const lastName = userData.lastName || userData.last_name || '';
    const name = userData.name;

    // Build full name
    if (name) return String(name);

    const fullName = [firstName, middleName, lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (fullName) return fullName;

    // Fallback to email
    if (userData.email) return String(userData.email);
  }

  // Final fallback
  return `User ${otherMember.userId?.slice(0, 8) || 'Unknown'}`;
};

export function ConversationListItem({
  conversation,
  isActive = false,
  currentUserId,
}: ConversationListItemProps) {
  const router = useRouter();
  
  const displayName = getConversationDisplayName(conversation, currentUserId);

  const handleClick = () => {
    router.push(`/chats/${conversation.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition cursor-pointer text-left border-b border-gray-100',
        isActive && 'bg-viber-purple-bg hover:bg-viber-purple-bg'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-viber-purple text-white font-semibold">
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator - mock as online for now */}
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-viber-online border-2 border-white rounded-full" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="font-semibold text-gray-900 truncate">
            {displayName}
          </p>
          {conversation.lastMessage && (
            <span className="text-xs text-gray-500 shrink-0">
              {formatDistanceToNow(new Date(conversation.lastMessage.timestamp), {
                addSuffix: false,
              })}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {conversation.lastMessage && (
            <p className="text-sm text-gray-600 truncate">
              {conversation.lastMessage.content}
            </p>
          )}
          {conversation.unreadCount > 0 && (
            <Badge className="bg-viber-purple hover:bg-viber-purple-dark shrink-0 h-5 min-w-5 px-1.5 text-xs">
              {conversation.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
