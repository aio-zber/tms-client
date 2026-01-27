'use client';

import { Menu, MoreVertical, Search, Users, LogOut, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsUserOnline } from '@/hooks/usePresence';
import { getUserImageUrl } from '@/lib/imageUtils';
import type { Conversation } from '@/types/conversation';

interface ChatHeaderProps {
  conversation: Conversation;
  conversationTitle: string;
  currentUserIsAdmin?: boolean;
  currentUserId?: string;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onViewProfile?: (userId: string) => void;
  onClearConversation: () => void;
  onLeaveConversation: () => void;
  onMobileMenuToggle?: () => void;
  showMobileMenu?: boolean;
}

export function ChatHeader({
  conversation,
  conversationTitle,
  currentUserIsAdmin = false,
  currentUserId,
  onOpenSearch,
  onOpenSettings,
  onViewProfile,
  onClearConversation,
  onLeaveConversation,
  onMobileMenuToggle,
  showMobileMenu = true,
}: ChatHeaderProps) {
  // Get other user ID for DM conversations
  const getOtherUserId = () => {
    if (conversation.type === 'dm' && currentUserId) {
      const otherMember = conversation.members.find((m) => m.userId !== currentUserId);
      return otherMember?.userId;
    }
    return undefined;
  };

  const otherUserId = getOtherUserId();

  // Check if other user is online (for DM conversations)
  const isOtherUserOnline = useIsUserOnline(otherUserId);

  return (
    <div className="p-3 md:p-4 border-b border-gray-200 bg-white flex items-center gap-2 md:gap-3">
      {/* Hamburger Menu (Mobile Only) */}
      {showMobileMenu && onMobileMenuToggle && (
        <button
          onClick={onMobileMenuToggle}
          className="p-2 hover:bg-gray-100 rounded-full transition lg:hidden"
          aria-label="Open conversations"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Avatar with Online Indicator */}
      <div className="relative overflow-visible">
        <Avatar className="w-10 h-10 md:w-12 md:h-12">
          <AvatarImage src={getUserImageUrl(conversation.avatarUrl)} />
          <AvatarFallback className="bg-viber-purple text-white font-semibold">
            {conversationTitle.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator for DM conversations */}
        {conversation.type === 'dm' && (
          <OnlineIndicator isOnline={isOtherUserOnline} size="md" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-base md:text-lg font-semibold truncate">{conversationTitle}</h1>
        {conversation.type === 'group' ? (
          <p className="text-xs md:text-sm text-gray-500">
            {conversation.members.length} member{conversation.members.length > 1 ? 's' : ''}
          </p>
        ) : (
          /* Online status text for DM conversations (Messenger-style) */
          <p className="text-xs md:text-sm text-gray-500">
            {isOtherUserOnline ? 'Active now' : 'Offline'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-gray-100 rounded-full transition">
              <MoreVertical className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {conversation.type === 'dm' && otherUserId && onViewProfile && (
              <>
                <DropdownMenuItem onClick={() => onViewProfile(otherUserId)}>
                  <User className="w-4 h-4 mr-2" />
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {conversation.type === 'group' && (
              <>
                {currentUserIsAdmin ? (
                  <DropdownMenuItem onClick={onOpenSettings}>
                    <Users className="w-4 h-4 mr-2" />
                    Manage Members
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onOpenSettings}>
                    <Users className="w-4 h-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onOpenSearch}>
              <Search className="w-4 h-4 mr-2" />
              Search Messages
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onClearConversation}
              className="text-orange-600"
            >
              Clear Conversation
            </DropdownMenuItem>
            {conversation.type === 'group' && (
              <DropdownMenuItem
                onClick={onLeaveConversation}
                className="text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Conversation
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
