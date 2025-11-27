# Backend Notification System Implementation Guide

This document provides complete backend implementation instructions for the notification system.

## Database Migrations

### Migration 1: Create notification_preferences Table

**File:** `alembic/versions/XXXX_create_notification_preferences.py`

```python
"""Create notification_preferences table

Revision ID: XXXX
Revises: previous_migration
Create Date: 2025-11-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = 'XXXX'
down_revision = 'previous_migration'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create notification_preferences table
    op.create_table(
        'notification_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sound_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sound_volume', sa.Integer(), nullable=False, server_default='75'),
        sa.Column('browser_notifications_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('enable_message_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enable_mention_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enable_reaction_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enable_member_activity_notifications', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dnd_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dnd_start', sa.Time(), nullable=True),
        sa.Column('dnd_end', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', name='uq_notification_preferences_user_id')
    )

    # Create index on user_id
    op.create_index('ix_notification_preferences_user_id', 'notification_preferences', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_notification_preferences_user_id')
    op.drop_table('notification_preferences')
```

### Migration 2: Create muted_conversations Table

```python
"""Create muted_conversations table

Revision ID: YYYY
Revises: XXXX
Create Date: 2025-11-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'YYYY'
down_revision = 'XXXX'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create muted_conversations table
    op.create_table(
        'muted_conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('muted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', 'conversation_id', name='uq_muted_conversations_user_conversation')
    )

    # Create indexes
    op.create_index('ix_muted_conversations_user_id', 'muted_conversations', ['user_id'])
    op.create_index('ix_muted_conversations_conversation_id', 'muted_conversations', ['conversation_id'])


def downgrade() -> None:
    op.drop_index('ix_muted_conversations_conversation_id')
    op.drop_index('ix_muted_conversations_user_id')
    op.drop_table('muted_conversations')
```

## SQLAlchemy Models

### Model 1: NotificationPreferences

**File:** `app/models/notification_preferences.py`

```python
from sqlalchemy import Column, Integer, Boolean, Time, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models.base import Base
import uuid


class NotificationPreferences(Base):
    """User notification preferences model"""

    __tablename__ = "notification_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Sound settings
    sound_enabled = Column(Boolean, nullable=False, default=True)
    sound_volume = Column(Integer, nullable=False, default=75)

    # Browser notifications
    browser_notifications_enabled = Column(Boolean, nullable=False, default=False)

    # Notification types
    enable_message_notifications = Column(Boolean, nullable=False, default=True)
    enable_mention_notifications = Column(Boolean, nullable=False, default=True)
    enable_reaction_notifications = Column(Boolean, nullable=False, default=True)
    enable_member_activity_notifications = Column(Boolean, nullable=False, default=False)

    # Do Not Disturb
    dnd_enabled = Column(Boolean, nullable=False, default=False)
    dnd_start = Column(Time, nullable=True)
    dnd_end = Column(Time, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "sound_enabled": self.sound_enabled,
            "sound_volume": self.sound_volume,
            "browser_notifications_enabled": self.browser_notifications_enabled,
            "enable_message_notifications": self.enable_message_notifications,
            "enable_mention_notifications": self.enable_mention_notifications,
            "enable_reaction_notifications": self.enable_reaction_notifications,
            "enable_member_activity_notifications": self.enable_member_activity_notifications,
            "dnd_enabled": self.dnd_enabled,
            "dnd_start": self.dnd_start.isoformat() if self.dnd_start else None,
            "dnd_end": self.dnd_end.isoformat() if self.dnd_end else None,
        }
```

### Model 2: MutedConversation

**File:** `app/models/muted_conversation.py`

```python
from sqlalchemy import Column, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models.base import Base
import uuid


class MutedConversation(Base):
    """Muted conversation model"""

    __tablename__ = "muted_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    muted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint('user_id', 'conversation_id', name='uq_muted_conversations_user_conversation'),
    )
```

## Pydantic Schemas

**File:** `app/schemas/notification.py`

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import time


class NotificationPreferencesBase(BaseModel):
    """Base schema for notification preferences"""
    sound_enabled: bool = True
    sound_volume: int = Field(default=75, ge=0, le=100)
    browser_notifications_enabled: bool = False
    enable_message_notifications: bool = True
    enable_mention_notifications: bool = True
    enable_reaction_notifications: bool = True
    enable_member_activity_notifications: bool = False
    dnd_enabled: bool = False
    dnd_start: Optional[str] = None  # "HH:MM" format
    dnd_end: Optional[str] = None  # "HH:MM" format


class NotificationPreferencesUpdate(BaseModel):
    """Schema for updating notification preferences"""
    sound_enabled: Optional[bool] = None
    sound_volume: Optional[int] = Field(default=None, ge=0, le=100)
    browser_notifications_enabled: Optional[bool] = None
    enable_message_notifications: Optional[bool] = None
    enable_mention_notifications: Optional[bool] = None
    enable_reaction_notifications: Optional[bool] = None
    enable_member_activity_notifications: Optional[bool] = None
    dnd_enabled: Optional[bool] = None
    dnd_start: Optional[str] = None
    dnd_end: Optional[str] = None


class NotificationPreferencesResponse(BaseModel):
    """Schema for notification preferences response"""
    success: bool = True
    data: NotificationPreferencesBase

    class Config:
        from_attributes = True
```

## FastAPI Endpoints

**File:** `app/api/v1/endpoints/notifications.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import time

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.notification_preferences import NotificationPreferences
from app.models.muted_conversation import MutedConversation
from app.schemas.notification import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationPreferencesBase
)

router = APIRouter()


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's notification preferences"""
    # Try to get existing preferences
    preferences = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    # Create default preferences if none exist
    if not preferences:
        preferences = NotificationPreferences(user_id=current_user.id)
        db.add(preferences)
        db.commit()
        db.refresh(preferences)

    return NotificationPreferencesResponse(
        success=True,
        data=NotificationPreferencesBase(**preferences.to_dict())
    )


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    updates: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's notification preferences"""
    # Get or create preferences
    preferences = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    if not preferences:
        preferences = NotificationPreferences(user_id=current_user.id)
        db.add(preferences)

    # Update fields
    update_data = updates.dict(exclude_unset=True)

    # Convert time strings to time objects
    if 'dnd_start' in update_data and update_data['dnd_start']:
        try:
            hour, minute = map(int, update_data['dnd_start'].split(':'))
            update_data['dnd_start'] = time(hour=hour, minute=minute)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid dnd_start format. Use HH:MM"
            )

    if 'dnd_end' in update_data and update_data['dnd_end']:
        try:
            hour, minute = map(int, update_data['dnd_end'].split(':'))
            update_data['dnd_end'] = time(hour=hour, minute=minute)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid dnd_end format. Use HH:MM"
            )

    # Apply updates
    for key, value in update_data.items():
        setattr(preferences, key, value)

    db.commit()
    db.refresh(preferences)

    return NotificationPreferencesResponse(
        success=True,
        data=NotificationPreferencesBase(**preferences.to_dict())
    )


@router.post("/conversations/{conversation_id}/mute")
async def mute_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mute a conversation"""
    # Check if already muted
    existing = db.query(MutedConversation).filter(
        MutedConversation.user_id == current_user.id,
        MutedConversation.conversation_id == conversation_id
    ).first()

    if existing:
        return {"success": True, "message": "Conversation already muted"}

    # Create muted conversation record
    muted = MutedConversation(
        user_id=current_user.id,
        conversation_id=conversation_id
    )
    db.add(muted)
    db.commit()

    return {"success": True, "message": "Conversation muted"}


@router.delete("/conversations/{conversation_id}/mute")
async def unmute_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unmute a conversation"""
    # Find and delete muted conversation record
    muted = db.query(MutedConversation).filter(
        MutedConversation.user_id == current_user.id,
        MutedConversation.conversation_id == conversation_id
    ).first()

    if not muted:
        return {"success": True, "message": "Conversation not muted"}

    db.delete(muted)
    db.commit()

    return {"success": True, "message": "Conversation unmuted"}


@router.get("/muted-conversations")
async def get_muted_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of muted conversation IDs"""
    muted = db.query(MutedConversation.conversation_id).filter(
        MutedConversation.user_id == current_user.id
    ).all()

    conversation_ids = [str(m.conversation_id) for m in muted]

    return {"success": True, "data": conversation_ids}
```

## Router Registration

**File:** `app/api/v1/api.py`

```python
# Add to existing router registration
from app.api.v1.endpoints import notifications

api_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"]
)
```

## Testing Commands

```bash
# Create migrations
alembic revision --autogenerate -m "Add notification preferences and muted conversations"

# Apply migrations
alembic upgrade head

# Test API endpoints (with valid JWT token)
# Get preferences
curl -X GET http://localhost:8000/api/v1/notifications/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Update preferences
curl -X PUT http://localhost:8000/api/v1/notifications/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sound_enabled": false, "dnd_enabled": true, "dnd_start": "22:00", "dnd_end": "08:00"}'

# Mute conversation
curl -X POST http://localhost:8000/api/v1/conversations/{conversation_id}/mute \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Unmute conversation
curl -X DELETE http://localhost:8000/api/v1/conversations/{conversation_id}/mute \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get muted conversations
curl -X GET http://localhost:8000/api/v1/notifications/muted-conversations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

**Implementation Time Estimate:** 4-6 hours

**Dependencies:**
- PostgreSQL database
- SQLAlchemy ORM
- Alembic migrations
- FastAPI framework
- Existing user authentication

**Notes:**
- All endpoints require TMS JWT authentication
- Preferences are created with defaults on first access
- Muting is per-user (different users can have different mute settings for same conversation)
- Time fields use PostgreSQL TIME type and are stored in 24-hour format
