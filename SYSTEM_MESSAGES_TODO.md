# System Messages Implementation Status

## ✅ What's Complete (Client-Side)

1. **Type Definitions**
   - Added `'SYSTEM'` to MessageType enum
   - Created SystemMessageMetadata interface
   - System message generators for all event types

2. **UI Rendering**
   - MessageBubble renders SYSTEM messages with centered, gray styling
   - No bubble, avatar, or message options for system messages

3. **Client-Side Event Handlers**
   - useConversationEvents creates system messages for:
     - member_added
     - member_removed
     - member_left
     - conversation_updated
     - message deleted (delete for everyone)

## ❌ Current Limitation

**System messages only appear when actively viewing the conversation where the event occurs.**

### Why?
- `useConversationEvents` hook is called per-conversation in Chat component
- Event handlers only run for the currently viewed conversation
- If you're viewing conversation A and someone removes a member from conversation B, no system message is created for conversation B

### Example Scenario:
```
User viewing: "Team Chat" (ID: abc-123)
Admin action: Removes member from "Project Group" (ID: xyz-789)

Result: ❌ No system message appears in "Project Group"
Reason: Event handler for "Project Group" isn't running
```

## 🔧 Required Backend Changes

**The proper solution is to have the backend create and broadcast system messages.**

### Backend Implementation Steps:

#### 1. Update Message Model
Already supports `type='SYSTEM'` - no changes needed if using same MessageType enum.

#### 2. Create System Message Helper Function
```python
def create_system_message(
    conversation_id: str,
    event_type: str,
    actor_id: str,
    actor_name: str,
    **kwargs
) -> Message:
    """
    Create a system message for conversation events.

    Args:
        conversation_id: Conversation ID
        event_type: 'member_added', 'member_removed', 'member_left', etc.
        actor_id: User ID who performed the action
        actor_name: Display name of actor
        **kwargs: Additional event-specific data (target_user_id, etc.)
    """
    # Format message content based on event type
    if event_type == 'member_added':
        added_names = kwargs.get('added_member_names', [])
        content = f"{actor_name} added {', '.join(added_names)} to the group"
    elif event_type == 'member_removed':
        target_name = kwargs.get('target_user_name', 'Member')
        content = f"{actor_name} removed {target_name}"
    elif event_type == 'member_left':
        content = f"{actor_name} left the group"
    elif event_type == 'conversation_updated':
        new_name = kwargs.get('new_name')
        if new_name:
            content = f"{actor_name} changed the group name to \"{new_name}\""
        else:
            content = f"{actor_name} changed the group photo"
    elif event_type == 'message_deleted':
        content = f"{actor_name} deleted a message"
    else:
        content = f"{actor_name} updated the group"

    # Create system message metadata
    metadata = {
        'system': {
            'event_type': event_type,
            'actor_id': actor_id,
            'actor_name': actor_name,
            **kwargs
        }
    }

    # Create message in database
    message = Message(
        conversation_id=conversation_id,
        sender_id=actor_id,
        content=content,
        type='SYSTEM',
        status='sent',
        metadata=metadata
    )

    return message
```

#### 3. Update Conversation Endpoints

**Add Member Endpoint** (`POST /conversations/{id}/members`):
```python
@router.post("/{conversation_id}/members")
async def add_members(conversation_id: str, data: AddMembersRequest):
    # ... existing add member logic ...

    # Create system message
    added_names = [get_user_name(uid) for uid in data.user_ids]
    system_message = create_system_message(
        conversation_id=conversation_id,
        event_type='member_added',
        actor_id=current_user.id,
        actor_name=get_user_name(current_user.id),
        added_member_ids=data.user_ids,
        added_member_names=added_names
    )
    db.add(system_message)
    db.commit()

    # Broadcast system message via WebSocket
    await socketio.emit('message:new', {
        'conversation_id': conversation_id,
        'message': message_to_dict(system_message)
    }, room=conversation_id)

    # Also broadcast member_added event (for member list updates)
    await socketio.emit('member_added', {
        'conversation_id': conversation_id,
        'added_members': [...]
    }, room=conversation_id)
```

**Remove Member Endpoint** (`DELETE /conversations/{id}/members/{user_id}`):
```python
@router.delete("/{conversation_id}/members/{user_id}")
async def remove_member(conversation_id: str, user_id: str):
    # ... existing remove member logic ...

    # Create system message
    target_name = get_user_name(user_id)
    system_message = create_system_message(
        conversation_id=conversation_id,
        event_type='member_removed',
        actor_id=current_user.id,
        actor_name=get_user_name(current_user.id),
        target_user_id=user_id,
        target_user_name=target_name
    )
    db.add(system_message)
    db.commit()

    # Broadcast system message
    await socketio.emit('message:new', {
        'conversation_id': conversation_id,
        'message': message_to_dict(system_message)
    }, room=conversation_id)

    # Also broadcast member_removed event
    await socketio.emit('member_removed', {
        'conversation_id': conversation_id,
        'removed_user_id': user_id
    }, room=conversation_id)
```

**Leave Conversation Endpoint** (`POST /conversations/{id}/leave`):
```python
@router.post("/{conversation_id}/leave")
async def leave_conversation(conversation_id: str):
    # ... existing leave logic ...

    # Create system message
    system_message = create_system_message(
        conversation_id=conversation_id,
        event_type='member_left',
        actor_id=current_user.id,
        actor_name=get_user_name(current_user.id)
    )
    db.add(system_message)
    db.commit()

    # Broadcast system message
    await socketio.emit('message:new', {
        'conversation_id': conversation_id,
        'message': message_to_dict(system_message)
    }, room=conversation_id)

    # Also broadcast member_left event
    await socketio.emit('member_left', {
        'conversation_id': conversation_id,
        'user_id': current_user.id,
        'user_name': get_user_name(current_user.id)
    }, room=conversation_id)
```

**Update Conversation Endpoint** (`PATCH /conversations/{id}`):
```python
@router.patch("/{conversation_id}")
async def update_conversation(conversation_id: str, data: UpdateConversationRequest):
    # ... existing update logic ...

    # Create system message
    updates = {}
    if data.name:
        updates['new_name'] = data.name
    if data.avatar_url:
        updates['new_avatar_url'] = data.avatar_url

    system_message = create_system_message(
        conversation_id=conversation_id,
        event_type='conversation_updated',
        actor_id=current_user.id,
        actor_name=get_user_name(current_user.id),
        **updates
    )
    db.add(system_message)
    db.commit()

    # Broadcast system message
    await socketio.emit('message:new', {
        'conversation_id': conversation_id,
        'message': message_to_dict(system_message)
    }, room=conversation_id)

    # Also broadcast conversation_updated event
    await socketio.emit('conversation_updated', {
        'conversation_id': conversation_id,
        'name': data.name,
        'avatar_url': data.avatar_url
    }, room=conversation_id)
```

**Delete Message Endpoint** (`DELETE /messages/{id}`):
```python
@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, scope: str = 'everyone'):
    # ... existing delete logic ...

    # Only create system message for "delete for everyone"
    if scope == 'everyone':
        message = db.query(Message).filter(Message.id == message_id).first()

        system_message = create_system_message(
            conversation_id=message.conversation_id,
            event_type='message_deleted',
            actor_id=current_user.id,
            actor_name=get_user_name(current_user.id)
        )
        db.add(system_message)
        db.commit()

        # Broadcast system message
        await socketio.emit('message:new', {
            'conversation_id': message.conversation_id,
            'message': message_to_dict(system_message)
        }, room=message.conversation_id)
```

## 📝 Client Changes Needed After Backend Update

Once backend is updated, remove client-side system message creation:

1. **Remove from Chat.tsx**:
   - Delete the `generateMessageDeletedMessage` call in `handleDeleteMessage`
   - System message will come via WebSocket `message:new` event

2. **Remove from useConversationEvents.ts**:
   - Remove all `generateXXXMessage` calls
   - Remove all `queryClient.setQueryData` calls that add system messages
   - Keep the event handlers for updating UI (member counts, etc.)
   - System messages will come via WebSocket `message:new` events

3. **Keep**:
   - MessageBubble rendering for SYSTEM type (already works)
   - System message type definitions
   - System message utilities (can be used for display logic)

## ✅ Testing Checklist (After Backend Changes)

- [ ] Add member to group → system message appears for ALL users in group
- [ ] Remove member from group → system message appears
- [ ] Member leaves group → system message appears
- [ ] Change group name → system message appears
- [ ] Delete message for everyone → system message appears
- [ ] System messages persist after page refresh (in message history)
- [ ] System messages appear even if not viewing the conversation when event occurs

## 🔐 Security Considerations

**Server-side validation** (already should exist, but verify):
- Only admins can remove members
- Users can only delete their own messages (within 48 hours for "delete for everyone")
- Validate actor_id matches authenticated user
- System messages cannot be created via normal message POST endpoint (server-only)

## 📚 References

- Client implementation: `src/features/messaging/utils/systemMessages.ts`
- Type definitions: `src/types/message.ts`
- UI rendering: `src/features/messaging/components/MessageBubble.tsx`
- Event handlers: `src/features/conversations/hooks/useConversationEvents.ts`
