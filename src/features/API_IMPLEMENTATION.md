# API Implementation Guide

This document provides a comprehensive guide for using all implemented messaging and conversation APIs in the TMS client.

## Table of Contents

1. [Message APIs](#message-apis)
2. [Conversation APIs](#conversation-apis)
3. [Usage Examples](#usage-examples)
4. [Type Definitions](#type-definitions)

---

## Message APIs

All message APIs are implemented in `src/features/messaging/`.

### Services (`messageService.ts`)

Direct API service functions:

```typescript
import { messageService } from '@/features/messaging';

// Send a new message
await messageService.sendMessage({
  conversation_id: 'conv-123',
  content: 'Hello world!',
  type: 'text', // optional
  reply_to_id: 'msg-456', // optional
});

// Get a message by ID
await messageService.getMessageById('msg-123');

// Edit a message
await messageService.editMessage('msg-123', {
  content: 'Updated message',
});

// Delete a message
await messageService.deleteMessage('msg-123');

// Add a reaction
await messageService.addReaction('msg-123', { emoji: '👍' });

// Remove a reaction
await messageService.removeReaction('msg-123', '👍');

// Get conversation messages
await messageService.getConversationMessages('conv-123', {
  limit: 50,
  offset: 0,
});

// Mark messages as read
await messageService.markMessagesAsRead({
  message_ids: ['msg-1', 'msg-2', 'msg-3'],
});

// Get unread count for a conversation
await messageService.getConversationUnreadCount('conv-123');

// Get total unread count
await messageService.getTotalUnreadCount();

// Search messages
await messageService.searchMessages({
  query: 'search term',
  conversation_id: 'conv-123', // optional
  type: 'text', // optional
  limit: 20,
});
```

### React Hooks

#### `useMessages` - Load and manage messages

```typescript
import { useMessages } from '@/features/messaging';

function MessageList({ conversationId }: { conversationId: string }) {
  const { messages, loading, error, hasMore, loadMore, refresh } = useMessages(
    conversationId,
    {
      limit: 50,
      autoLoad: true,
    }
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      {hasMore && <button onClick={loadMore}>Load More</button>}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

#### `useSendMessage` - Send messages

```typescript
import { useSendMessage } from '@/features/messaging';

function MessageInput({ conversationId }: { conversationId: string }) {
  const { sendMessage, sending, error } = useSendMessage();
  const [content, setContent] = useState('');

  const handleSend = async () => {
    const message = await sendMessage({
      conversation_id: conversationId,
      content,
    });

    if (message) {
      setContent('');
      console.log('Message sent:', message);
    }
  };

  return (
    <div>
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={sending}
      />
      <button onClick={handleSend} disabled={sending}>
        {sending ? 'Sending...' : 'Send'}
      </button>
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

#### `useMessageActions` - Edit, delete, and react to messages

```typescript
import { useMessageActions } from '@/features/messaging';

function MessageActions({ messageId }: { messageId: string }) {
  const { editMessage, deleteMessage, addReaction, removeReaction, loading } =
    useMessageActions();

  const handleEdit = async () => {
    const updated = await editMessage(messageId, {
      content: 'Updated content',
    });
    if (updated) console.log('Message updated');
  };

  const handleDelete = async () => {
    const success = await deleteMessage(messageId);
    if (success) console.log('Message deleted');
  };

  const handleReaction = async () => {
    const success = await addReaction(messageId, '❤️');
    if (success) console.log('Reaction added');
  };

  return (
    <div>
      <button onClick={handleEdit} disabled={loading}>Edit</button>
      <button onClick={handleDelete} disabled={loading}>Delete</button>
      <button onClick={handleReaction}>React</button>
    </div>
  );
}
```

#### `useUnreadCount` - Track unread messages

```typescript
import { useUnreadCount } from '@/features/messaging';

function UnreadBadge({ conversationId }: { conversationId?: string }) {
  const { unreadCount, loading, refresh } = useUnreadCount({
    conversationId, // omit for total unread count
    autoLoad: true,
    refreshInterval: 30000, // refresh every 30 seconds
  });

  if (loading) return null;

  return unreadCount > 0 ? (
    <span className="badge">{unreadCount}</span>
  ) : null;
}
```

#### `useSearchMessages` - Search messages

```typescript
import { useSearchMessages } from '@/features/messaging';

function MessageSearch() {
  const { results, searching, search, clear } = useSearchMessages();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    search(query, {
      conversation_id: 'conv-123', // optional
      limit: 20,
    });
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages..."
      />
      <button onClick={handleSearch} disabled={searching}>
        Search
      </button>
      <button onClick={clear}>Clear</button>

      {searching && <div>Searching...</div>}

      <div>
        {results.map((msg) => (
          <div key={msg.id}>{msg.content}</div>
        ))}
      </div>
    </div>
  );
}
```

---

## Conversation APIs

All conversation APIs are implemented in `src/features/conversations/`.

### Services (`conversationService.ts`)

Direct API service functions:

```typescript
import { conversationService } from '@/features/conversations';

// Create a new conversation
await conversationService.createConversation({
  type: 'group',
  member_ids: ['user-1', 'user-2'],
  name: 'Team Chat',
  avatar_url: 'https://example.com/avatar.jpg',
});

// Get user's conversations
await conversationService.getConversations({
  limit: 20,
  offset: 0,
  type: 'group', // optional: filter by type
});

// Get a conversation by ID
await conversationService.getConversationById('conv-123');

// Update conversation details
await conversationService.updateConversation('conv-123', {
  name: 'Updated Name',
  avatar_url: 'https://example.com/new-avatar.jpg',
});

// Add members to conversation
await conversationService.addMembers('conv-123', {
  member_ids: ['user-3', 'user-4'],
});

// Remove a member from conversation
await conversationService.removeMember('conv-123', 'user-2');

// Leave a conversation
await conversationService.leaveConversation('conv-123');

// Update conversation settings
await conversationService.updateConversationSettings('conv-123', {
  is_muted: true,
  is_pinned: true,
});

// Mark conversation as read
await conversationService.markConversationAsRead('conv-123');
```

### React Hooks

#### `useConversations` - Load and manage conversation list

```typescript
import { useConversations } from '@/features/conversations';

function ConversationList() {
  const { conversations, loading, error, hasMore, loadMore, refresh } =
    useConversations({
      limit: 20,
      type: 'group', // optional: filter by type
      autoLoad: true,
    });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {conversations.map((conv) => (
        <div key={conv.id}>{conv.name || 'Direct Message'}</div>
      ))}
      {hasMore && <button onClick={loadMore}>Load More</button>}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

#### `useConversation` - Load a single conversation

```typescript
import { useConversation } from '@/features/conversations';

function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { conversation, loading, error, refresh } = useConversation(
    conversationId,
    {
      autoLoad: true,
    }
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!conversation) return <div>Conversation not found</div>;

  return (
    <div>
      <h1>{conversation.name || 'Direct Message'}</h1>
      <p>Members: {conversation.members.length}</p>
      <p>Created: {conversation.createdAt}</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

#### `useConversationActions` - Manage conversations

```typescript
import { useConversationActions } from '@/features/conversations';

function ConversationManager() {
  const {
    createConversation,
    updateConversation,
    addMembers,
    removeMember,
    leaveConversation,
    updateSettings,
    markAsRead,
    loading,
    error,
  } = useConversationActions();

  const handleCreate = async () => {
    const conversation = await createConversation({
      type: 'group',
      member_ids: ['user-1', 'user-2'],
      name: 'New Group',
    });

    if (conversation) {
      console.log('Conversation created:', conversation);
    }
  };

  const handleUpdate = async (conversationId: string) => {
    const updated = await updateConversation(conversationId, {
      name: 'Updated Name',
    });

    if (updated) {
      console.log('Conversation updated');
    }
  };

  const handleAddMembers = async (conversationId: string) => {
    const success = await addMembers(conversationId, ['user-3', 'user-4']);
    if (success) console.log('Members added');
  };

  const handleRemoveMember = async (conversationId: string) => {
    const success = await removeMember(conversationId, 'user-2');
    if (success) console.log('Member removed');
  };

  const handleLeave = async (conversationId: string) => {
    const success = await leaveConversation(conversationId);
    if (success) console.log('Left conversation');
  };

  const handleMute = async (conversationId: string) => {
    const success = await updateSettings(conversationId, {
      is_muted: true,
    });
    if (success) console.log('Conversation muted');
  };

  const handleMarkRead = async (conversationId: string) => {
    const success = await markAsRead(conversationId);
    if (success) console.log('Marked as read');
  };

  return (
    <div>
      <button onClick={handleCreate} disabled={loading}>
        Create Conversation
      </button>
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

---

## Usage Examples

### Complete Message Flow

```typescript
import {
  useMessages,
  useSendMessage,
  useMessageActions,
  useUnreadCount,
} from '@/features/messaging';

function ChatInterface({ conversationId }: { conversationId: string }) {
  const { messages, loading, refresh } = useMessages(conversationId);
  const { sendMessage, sending } = useSendMessage();
  const { editMessage, deleteMessage, addReaction } = useMessageActions();
  const { unreadCount } = useUnreadCount({ conversationId });

  const [inputValue, setInputValue] = useState('');

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const message = await sendMessage({
      conversation_id: conversationId,
      content: inputValue,
    });

    if (message) {
      setInputValue('');
      refresh();
    }
  };

  const handleEdit = async (messageId: string, newContent: string) => {
    await editMessage(messageId, { content: newContent });
    refresh();
  };

  const handleDelete = async (messageId: string) => {
    await deleteMessage(messageId);
    refresh();
  };

  const handleReact = async (messageId: string, emoji: string) => {
    await addReaction(messageId, emoji);
    refresh();
  };

  return (
    <div>
      <div>Unread: {unreadCount}</div>

      {loading ? (
        <div>Loading messages...</div>
      ) : (
        <div>
          {messages.map((msg) => (
            <div key={msg.id}>
              <p>{msg.content}</p>
              <button onClick={() => handleEdit(msg.id, 'New content')}>
                Edit
              </button>
              <button onClick={() => handleDelete(msg.id)}>Delete</button>
              <button onClick={() => handleReact(msg.id, '👍')}>
                React
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={sending}
        />
        <button onClick={handleSend} disabled={sending}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

### Complete Conversation Flow

```typescript
import {
  useConversations,
  useConversation,
  useConversationActions,
} from '@/features/conversations';

function ConversationManager() {
  const { conversations, refresh: refreshList } = useConversations();
  const { createConversation, updateConversation, addMembers } =
    useConversationActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { conversation } = useConversation(selectedId || '', {
    autoLoad: !!selectedId,
  });

  const handleCreateGroup = async () => {
    const newConv = await createConversation({
      type: 'group',
      member_ids: ['user-1', 'user-2', 'user-3'],
      name: 'Project Discussion',
    });

    if (newConv) {
      refreshList();
      setSelectedId(newConv.id);
    }
  };

  const handleAddMembers = async (conversationId: string) => {
    const success = await addMembers(conversationId, ['user-4']);
    if (success) {
      refreshList();
    }
  };

  return (
    <div>
      <div>
        <h2>Conversations</h2>
        <button onClick={handleCreateGroup}>Create Group</button>
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setSelectedId(conv.id)}
            style={{
              fontWeight: conv.id === selectedId ? 'bold' : 'normal',
            }}
          >
            {conv.name || 'DM'}
            {conv.unreadCount > 0 && (
              <span> ({conv.unreadCount})</span>
            )}
          </div>
        ))}
      </div>

      {conversation && (
        <div>
          <h2>{conversation.name || 'Direct Message'}</h2>
          <p>Members: {conversation.members.length}</p>
          <button onClick={() => handleAddMembers(conversation.id)}>
            Add Member
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Type Definitions

### Message Types

```typescript
// Located in src/types/message.ts

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  metadata?: MessageMetadata;
  replyTo?: Message;
  replyToId?: string;
  reactions?: MessageReaction[];
  isEdited: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface SendMessageRequest {
  conversation_id: string;
  content: string;
  type?: MessageType;
  reply_to_id?: string;
  metadata?: MessageMetadata;
}

export interface EditMessageRequest {
  content: string;
}

export interface SearchMessagesRequest {
  query: string;
  conversation_id?: string;
  type?: MessageType;
  sender_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}
```

### Conversation Types

```typescript
// Located in src/types/conversation.ts

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  members: ConversationMember[];
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: string;
  };
  unreadCount: number;
  isMuted: boolean;
  muteUntil?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationRequest {
  type: ConversationType;
  member_ids: string[];
  name?: string;
  avatar_url?: string;
}

export interface UpdateConversationRequest {
  name?: string;
  avatar_url?: string;
}

export interface UpdateConversationSettingsRequest {
  is_muted?: boolean;
  mute_until?: string;
  is_pinned?: boolean;
  custom_notifications?: boolean;
}
```

---

## API Endpoint Mapping

### Messages

| Hook/Service | HTTP Method | Endpoint | Description |
|-------------|-------------|----------|-------------|
| `sendMessage` | POST | `/api/v1/messages/` | Send a new message |
| `getMessageById` | GET | `/api/v1/messages/{message_id}` | Get a message by ID |
| `editMessage` | PUT | `/api/v1/messages/{message_id}` | Edit a message |
| `deleteMessage` | DELETE | `/api/v1/messages/{message_id}` | Delete a message |
| `addReaction` | POST | `/api/v1/messages/{message_id}/reactions` | Add a reaction |
| `removeReaction` | DELETE | `/api/v1/messages/{message_id}/reactions/{emoji}` | Remove a reaction |
| `getConversationMessages` | GET | `/api/v1/messages/conversations/{conversation_id}/messages` | Get conversation messages |
| `markMessagesAsRead` | POST | `/api/v1/messages/mark-read` | Mark messages as read |
| `getConversationUnreadCount` | GET | `/api/v1/messages/conversations/{conversation_id}/unread-count` | Get conversation unread count |
| `getTotalUnreadCount` | GET | `/api/v1/messages/unread-count` | Get total unread count |
| `searchMessages` | POST | `/api/v1/messages/search` | Search messages |

### Conversations

| Hook/Service | HTTP Method | Endpoint | Description |
|-------------|-------------|----------|-------------|
| `createConversation` | POST | `/api/v1/conversations/` | Create a new conversation |
| `getConversations` | GET | `/api/v1/conversations/` | Get user's conversations |
| `getConversationById` | GET | `/api/v1/conversations/{conversation_id}` | Get a conversation by ID |
| `updateConversation` | PUT | `/api/v1/conversations/{conversation_id}` | Update conversation details |
| `addMembers` | POST | `/api/v1/conversations/{conversation_id}/members` | Add members to conversation |
| `removeMember` | DELETE | `/api/v1/conversations/{conversation_id}/members/{member_id}` | Remove a member |
| `leaveConversation` | POST | `/api/v1/conversations/{conversation_id}/leave` | Leave a conversation |
| `updateConversationSettings` | PUT | `/api/v1/conversations/{conversation_id}/settings` | Update conversation settings |
| `markConversationAsRead` | POST | `/api/v1/conversations/{conversation_id}/mark-read` | Mark conversation as read |

---

## Best Practices

1. **Error Handling**: All hooks return an `error` property. Always check for errors and handle them appropriately.

2. **Loading States**: Use the `loading` property to show loading indicators and disable buttons during API calls.

3. **Optimistic Updates**: For better UX, update local state optimistically before API calls complete, then refresh on success/failure.

4. **Auto-Loading**: Use `autoLoad: false` in hooks when you want manual control over when data is fetched.

5. **Pagination**: Use `limit` and `offset` parameters for pagination. Check `hasMore` to know if more data is available.

6. **Refresh Intervals**: For real-time data like unread counts, use `refreshInterval` option in hooks or integrate with WebSocket events.

7. **Type Safety**: All functions and hooks are fully typed. Use TypeScript for better development experience.

---

## Integration with WebSocket

For real-time updates, integrate these hooks with WebSocket events:

```typescript
import { useMessages } from '@/features/messaging';
import { useEffect } from 'react';

function ChatWithRealtime({ conversationId }) {
  const { messages, refresh } = useMessages(conversationId);

  useEffect(() => {
    // Listen for new messages via WebSocket
    socket.on('message:new', (data) => {
      if (data.conversationId === conversationId) {
        refresh();
      }
    });

    return () => {
      socket.off('message:new');
    };
  }, [conversationId, refresh]);

  // ... rest of component
}
```

---

For more information, refer to the CLAUDE.md file in the project root.
