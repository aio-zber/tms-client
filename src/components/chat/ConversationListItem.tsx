'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserImageUrl } from '@/lib/imageUtils';
import { Badge } from '@/components/ui/badge';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import type { Conversation } from '@/types';
import { formatSidebarTimestamp } from '@/lib/dateUtils';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useIsUserOnline } from '@/hooks/usePresence';
import { Lock } from 'lucide-react';
import {
  getConversationDisplayName,
  getNameInitials,
  getOtherUserId,
} from '@/lib/conversationUtils';

/**
 * Detect if message content is encrypted ciphertext (JSON with E2EE envelope).
 * Fallback for when the backend doesn't send the `encrypted` flag.
 */
function isEncryptedContent(content: string): boolean {
  return content.startsWith('{"v":') || content.startsWith('{"V":');
}

interface ConversationListItemProps {
  conversation: Conversation;
  isActive?: boolean;
  currentUserId?: string;
}

export function ConversationListItem({
  conversation,
  isActive = false,
  currentUserId,
}: ConversationListItemProps) {
  const router = useRouter();

  const displayName = getConversationDisplayName(conversation, currentUserId);

  // Get other user's online status for DM conversations (Messenger-style)
  const otherUserId = getOtherUserId(conversation, currentUserId);
  const isOtherUserOnline = useIsUserOnline(otherUserId);

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
      <div className="relative shrink-0 overflow-visible">
        <Avatar className="h-12 w-12">
          <AvatarImage src={getUserImageUrl(conversation.avatarUrl)} />
          <AvatarFallback className="bg-viber-purple text-white font-semibold">
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator - only shown for DM conversations when other user is online */}
        <OnlineIndicator isOnline={isOtherUserOnline} size="md" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="font-semibold text-gray-900 truncate">
            {displayName}
          </p>
          {conversation.lastMessage && (
            <span className="text-xs text-gray-500 shrink-0 min-w-fit">
              {formatSidebarTimestamp(conversation.lastMessage.timestamp)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {conversation.lastMessage && (
            <p className="text-sm text-gray-600 truncate">
              {(conversation.lastMessage.encrypted || isEncryptedContent(conversation.lastMessage.content)) ? (
                <span className="flex items-center gap-1 text-gray-400 italic">
                  <Lock className="w-3 h-3" />
                  Encrypted message
                </span>
              ) : (
                conversation.lastMessage.content
              )}
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
