# Backend System Messages Migration Guide

## Current State

System messages are generated **client-side only** via `useGlobalConversationEvents` hook:
- ✅ Works immediately, provides real-time feedback
- ❌ Not persisted, disappears on refresh
- ❌ No audit trail or search capability

## Target State

System messages should be created by the **backend** and persisted in the database.

## Migration Steps

### 1. Backend Implementation

#### Create System Message Helper (Python/FastAPI)

```python
# app/services/system_messages.py

from app.models import Message
from sqlalchemy.orm import Session

def create_system_message(
    db: Session,
    conversation_id: str,
    actor_id: str,
    actor_name: str,
    event_type: str,
    **metadata
) -> Message:
    """
    Create and persist a system message.

    Args:
        conversation_id: Target conversation
        actor_id: User who triggered the event
        actor_name: Display name of actor
        event_type: 'member_added' | 'member_removed' | 'member_left' |
                    'message_deleted' | 'conversation_updated'
        **metadata: Event-specific data (added_member_names, etc.)
    """
    # Generate content based on event type
    content = _generate_content(event_type, actor_name, **metadata)

    # Create system message
    system_message = Message(
        conversation_id=conversation_id,
        sender_id=actor_id,
        content=content,
        type='SYSTEM',
        status='sent',
        metadata={
            'system': {
                'event_type': event_type,
                'actor_id': actor_id,
                'actor_name': actor_name,
                **metadata
            }
        }
    )

    db.add(system_message)
    db.commit()
    db.refresh(system_message)

    return system_message

def _generate_content(event_type: str, actor_name: str, **kwargs) -> str:
    """Generate human-readable content for system message."""
    if event_type == 'member_added':
        names = ', '.join(kwargs.get('added_member_names', []))
        return f"{actor_name} added {names} to the group"
    elif event_type == 'member_removed':
        return f"{actor_name} removed {kwargs.get('target_user_name', 'Member')}"
    elif event_type == 'member_left':
        return f"{actor_name} left the group"
    elif event_type == 'conversation_updated':
        if kwargs.get('new_name'):
            return f"{actor_name} changed the group name to \"{kwargs['new_name']}\""
        return f"{actor_name} changed the group photo"
    elif event_type == 'message_deleted':
        return f"{actor_name} deleted a message"
    else:
        return f"{actor_name} updated the group"
```

#### Update API Endpoints

```python
# app/api/v1/conversations.py

@router.post("/{conversation_id}/members")
async def add_members(
    conversation_id: str,
    data: AddMembersRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ... existing add member logic ...

    # Create system message
    system_msg = create_system_message(
        db=db,
        conversation_id=conversation_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        event_type='member_added',
        added_member_ids=[m.id for m in added_members],
        added_member_names=[m.full_name for m in added_members]
    )

    # Broadcast system message as regular message
    await socketio.emit('message:new', {
        'conversation_id': conversation_id,
        'message': message_to_dict(system_msg)
    }, room=conversation_id)

    # Also broadcast member_added event (for member list updates)
    await socketio.emit('member_added', {
        'conversation_id': conversation_id,
        'added_members': [...]
    }, room=conversation_id)

    return system_msg
```

**Repeat for:**
- `DELETE /{conversation_id}/members/{user_id}` → member_removed
- `POST /{conversation_id}/leave` → member_left
- `PATCH /{conversation_id}` → conversation_updated
- `DELETE /messages/{message_id}` → message_deleted (when scope='everyone')

### 2. Client-Side Cleanup

Once backend is deployed:

1. **Remove client-side generation:**
   ```typescript
   // src/app/(main)/layout.tsx
   // Remove this line:
   useGlobalConversationEvents(); // ❌ Delete
   ```

2. **Delete the hook file:**
   ```bash
   rm src/features/conversations/hooks/useGlobalConversationEvents.ts
   ```

3. **Delete system message generators:**
   ```bash
   rm src/features/messaging/utils/systemMessages.ts
   ```

4. **Keep rendering logic:**
   - `MessageBubble.tsx` - Already handles SYSTEM type correctly
   - Type definitions in `types/message.ts`
   - Event types in `types/conversation.ts`

### 3. Testing Checklist

After backend deployment:

- [ ] Add member → system message appears and persists after refresh
- [ ] Remove member → system message appears and persists
- [ ] Leave group → system message appears and persists
- [ ] Change group name → system message appears and persists
- [ ] Delete message → system message appears and persists
- [ ] System messages included in message history pagination
- [ ] System messages appear even when not viewing the conversation
- [ ] Multiple clients see consistent system messages

### 4. Deployment Strategy

**Option A - Clean Cut:**
1. Deploy backend with system message creation
2. Deploy client without `useGlobalConversationEvents`
3. Done ✅

**Option B - Zero-Downtime (Recommended):**
1. Deploy backend with system message creation
2. Keep client's `useGlobalConversationEvents` for 1 week
3. Observe both work simultaneously (harmless duplication)
4. Deploy client cleanup after verification
5. Done ✅

## Why Backend Implementation Is Better

| Aspect | Client-Side (Current) | Backend (Target) |
|--------|----------------------|------------------|
| Persistence | ❌ Lost on refresh | ✅ Stored in DB |
| Audit Trail | ❌ None | ✅ Full history |
| Security | ⚠️ Client-generated | ✅ Server-validated |
| Searchable | ❌ No | ✅ Yes |
| Consistency | ⚠️ Per-client | ✅ All clients |
| Message History | ❌ Not included | ✅ Included |
| Connection Recovery | ❌ Lost messages | ✅ Recovered |

## Estimated Effort

- **Backend:** 4-6 hours (helper function + 5 endpoints)
- **Client Cleanup:** 30 minutes (remove files)
- **Testing:** 2 hours
- **Total:** ~1 developer day

## Priority

**Low-Medium** - Current client-side solution is acceptable for:
- MVP/early product stages
- Limited backend resources
- Non-compliance-critical applications

**High** if you need:
- Audit trail for compliance (HIPAA, SOC2, etc.)
- Searchable conversation history
- Production-grade chat system
- 100% data consistency

## Questions?

See also: `SYSTEM_MESSAGES_TODO.md` for detailed backend code examples.
