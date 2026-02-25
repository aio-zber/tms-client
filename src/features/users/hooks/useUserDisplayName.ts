'use client';

import { useCallback } from 'react';
import type { Conversation } from '@/types/conversation';

/**
 * Hook to get display name for a user in a conversation
 * Handles multiple name formats and provides sensible fallbacks
 *
 * @param conversation - The conversation containing user membership data
 * @returns A function that takes a userId and returns the display name
 */
export function useUserDisplayName(conversation: Conversation | null) {
  return useCallback((userId: string): string => {
    if (!conversation || !conversation.members) return 'Unknown';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = conversation.members.find((m: any) => m.userId === userId);
    if (!member) return 'Unknown';

    // Check if member has enriched user data from backend
    const memberData = member as unknown as Record<string, unknown>;
    const userData = memberData.user as Record<string, unknown> | undefined;

    if (userData) {
      // Try to get full name from various fields
      const firstName = userData.firstName || userData.first_name || '';
      const lastName = userData.lastName || userData.last_name || '';
      const name = userData.name;

      // Build full name (first + last only, no middle name — Messenger pattern)
      if (name) return String(name);

      const fullName = [firstName, lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (fullName) return fullName;

      // Fallback to email
      if (userData.email) return String(userData.email);
    }

    // Final fallback - show partial UUID
    return `User ${userId?.slice(0, 8) || userId}`;
  }, [conversation]); // Only recreate when conversation changes
}
