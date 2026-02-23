/**
 * Conversation display utilities
 * Shared helpers for resolving conversation display names and initials
 */

import type { Conversation } from '@/types/conversation';

/**
 * Get conversation display name with proper name resolution.
 * For DM conversations, resolves the other user's full name from enriched member data.
 * For group conversations, uses the group name.
 *
 * Priority chain (DMs): display_name → member name → firstName+lastName → email → User ID
 * Priority chain (Groups): name → display_name → 'Group Chat'
 */
export function getConversationDisplayName(
  conversation: Conversation,
  currentUserId?: string
): string {
  // For group conversations, use the group name
  if (conversation.type === 'group') {
    return conversation.name || conversation.display_name || 'Group Chat';
  }

  // For DM conversations, resolve the other user's name from enriched member data
  if (conversation.members && conversation.members.length > 0) {
    const otherMember = conversation.members.find(
      (m) => m.userId !== currentUserId
    );

    if (otherMember?.user) {
      const user = otherMember.user;

      // Try pre-computed name
      if (user.name) return user.name;

      // Try building from parts (handle both camelCase and snake_case from backend)
      const memberData = otherMember as unknown as Record<string, unknown>;
      const userData = memberData.user as Record<string, unknown> | undefined;

      if (userData) {
        const firstName = userData.firstName || userData.first_name || '';
        const middleName = userData.middleName || userData.middle_name || '';
        const lastName = userData.lastName || userData.last_name || '';

        const fullName = [firstName, middleName, lastName]
          .filter(Boolean)
          .join(' ')
          .trim();

        if (fullName) return fullName;

        // Fallback to email
        if (userData.email) return String(userData.email);
      }
    }
  }

  // Fallback to backend-computed display_name
  if (conversation.display_name) return conversation.display_name;

  return 'Direct Message';
}

/**
 * Get initials from a display name string.
 * Takes the first letter of up to 2 words.
 */
export function getNameInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}

/**
 * Get the other user's ID in a DM conversation.
 * Returns undefined for group conversations.
 */
export function getOtherUserId(
  conversation: Conversation,
  currentUserId?: string
): string | undefined {
  if (conversation.type !== 'dm' || !conversation.members) {
    return undefined;
  }
  const otherMember = conversation.members.find(
    (m) => m.userId !== currentUserId
  );
  return otherMember?.userId;
}

/**
 * Get a meaningful preview label for encrypted messages (Messenger pattern).
 * Uses message type to show "Photo", "Voice message", etc. instead of "Encrypted message".
 */
export function getEncryptedMessagePreview(type?: string): string {
  switch (type?.toUpperCase()) {
    case 'IMAGE':
      return 'Photo';
    case 'VIDEO':
      return 'Video';
    case 'VOICE':
      return 'Voice message';
    case 'FILE':
      return 'File';
    case 'POLL':
      return 'Poll';
    default:
      return 'Encrypted message';
  }
}
