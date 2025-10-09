import type { User, Conversation, Message } from '@/types';

// Mock current user (from TMS)
export const mockCurrentUser: User = {
  id: 'user-1',
  tmsUserId: 'tms-user-123',
  username: 'John Doe',
  displayName: 'John Doe',
  email: 'john.doe@gcg.com',
  position: 'Senior Developer',
  avatarUrl: undefined,
  role: 'user',
  status: 'online',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date('2024-01-01').toISOString(),
};

// Mock conversations
export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    type: 'dm',
    name: 'Florence Dorrance',
    avatarUrl: undefined,
    members: [
      {
        userId: 'user-1',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId: 'user-2',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ],
    lastMessage: {
      content: 'Hi John, are you free for a call?',
      senderId: 'user-2',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    unreadCount: 3,
    isMuted: false,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    type: 'dm',
    name: 'Amanda Dorrance',
    avatarUrl: undefined,
    members: [
      {
        userId: 'user-1',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId: 'user-3',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ],
    lastMessage: {
      content: 'Great! Let me know if you need anything.',
      senderId: 'user-3',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    unreadCount: 0,
    isMuted: false,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-3',
    type: 'dm',
    name: 'Janet Lewdy',
    avatarUrl: undefined,
    members: [
      {
        userId: 'user-1',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId: 'user-4',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ],
    lastMessage: {
      content: 'Thanks for the update!',
      senderId: 'user-1',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
    unreadCount: 0,
    isMuted: false,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-4',
    type: 'dm',
    name: 'Lown Letia',
    avatarUrl: undefined,
    members: [
      {
        userId: 'user-1',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId: 'user-5',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ],
    lastMessage: {
      content: 'See you tomorrow!',
      senderId: 'user-5',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    unreadCount: 0,
    isMuted: false,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-5',
    type: 'dm',
    name: 'Max Robertson',
    avatarUrl: undefined,
    members: [
      {
        userId: 'user-1',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId: 'user-6',
        role: 'member',
        joinedAt: new Date('2024-01-01').toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ],
    lastMessage: {
      content: 'Perfect, thanks!',
      senderId: 'user-6',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    },
    unreadCount: 0,
    isMuted: false,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Mock messages for a conversation
export const mockMessages: Message[] = [
  {
    id: 'msg-101',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Hey John! How are you doing?',
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'msg-102',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: "I'm doing great! Working on the new messaging app.",
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: 'msg-103',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'That sounds exciting! How is it coming along?',
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    id: 'msg-104',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content:
      'Pretty well! Just working on the layout now. The Viber-inspired design is looking nice.',
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'msg-105',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: "Nice! Can I see a demo when you're done?",
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: 'msg-106',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: "Of course! I'll send you a link soon.",
    type: 'text',
    status: 'read',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
  },
  {
    id: 'msg-107',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Hi John, are you free for a call?',
    type: 'text',
    status: 'delivered',
    metadata: undefined,
    isEdited: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
];

// Helper to get user initials for avatar
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
