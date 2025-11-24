/**
 * System Message Utilities
 * Generate formatted system messages for conversation events
 */

import type { Message, SystemMessageMetadata } from '@/types/message';

/**
 * Generate a system message for member added event
 */
export function generateMemberAddedMessage(
  conversationId: string,
  actorId: string,
  actorName: string,
  addedMemberIds: string[],
  addedMemberNames: string[]
): Message {
  const membersList = addedMemberNames.join(', ');
  const content = addedMemberIds.length === 1
    ? `${actorName} added ${membersList} to the group`
    : `${actorName} added ${membersList} to the group`;

  const metadata: SystemMessageMetadata = {
    eventType: 'member_added',
    actorId,
    actorName,
    addedMemberIds,
    addedMemberNames,
  };

  return createSystemMessage(conversationId, actorId, content, metadata);
}

/**
 * Generate a system message for member removed event
 */
export function generateMemberRemovedMessage(
  conversationId: string,
  actorId: string,
  actorName: string,
  targetUserId: string,
  targetUserName: string
): Message {
  const content = `${actorName} removed ${targetUserName}`;

  const metadata: SystemMessageMetadata = {
    eventType: 'member_removed',
    actorId,
    actorName,
    targetUserId,
    targetUserName,
  };

  return createSystemMessage(conversationId, actorId, content, metadata);
}

/**
 * Generate a system message for member left event
 */
export function generateMemberLeftMessage(
  conversationId: string,
  userId: string,
  userName: string
): Message {
  const content = `${userName} left the group`;

  const metadata: SystemMessageMetadata = {
    eventType: 'member_left',
    actorId: userId,
    actorName: userName,
  };

  return createSystemMessage(conversationId, userId, content, metadata);
}

/**
 * Generate a system message for message deleted event
 */
export function generateMessageDeletedMessage(
  conversationId: string,
  actorId: string,
  actorName: string
): Message {
  const content = `${actorName} deleted a message`;

  const metadata: SystemMessageMetadata = {
    eventType: 'message_deleted',
    actorId,
    actorName,
  };

  return createSystemMessage(conversationId, actorId, content, metadata);
}

/**
 * Generate a system message for conversation updated event
 */
export function generateConversationUpdatedMessage(
  conversationId: string,
  actorId: string,
  actorName: string,
  updates: { name?: string; avatarUrl?: string }
): Message {
  let content = '';

  if (updates.name) {
    content = `${actorName} changed the group name to "${updates.name}"`;
  } else if (updates.avatarUrl) {
    content = `${actorName} changed the group photo`;
  } else {
    content = `${actorName} updated the group`;
  }

  const metadata: SystemMessageMetadata = {
    eventType: 'conversation_updated',
    actorId,
    actorName,
    details: updates,
  };

  return createSystemMessage(conversationId, actorId, content, metadata);
}

/**
 * Helper function to create a system message object
 */
function createSystemMessage(
  conversationId: string,
  senderId: string,
  content: string,
  systemMetadata: SystemMessageMetadata
): Message {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    conversationId,
    senderId,
    content,
    type: 'SYSTEM',
    status: 'sent',
    metadata: {
      system: systemMetadata,
    },
    isEdited: false,
    createdAt: new Date().toISOString(),
  };
}
