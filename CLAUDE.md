# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GCG Team Messaging App (TMA)** - A Viber-inspired team messaging application integrated with Team Management System (TMS).

### Architecture

- **Two-Repo Structure**: Separate backend (`chatflow-server`) and frontend (`chatflow-client`) repositories
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Redis + python-socketio
- **Frontend**: Next.js 14 (App Router) + TypeScript + TailwindCSS + shadcn/ui + Zustand + Socket.io-client
- **Real-time**: WebSocket messaging via Socket.io for instant communication
- **Authentication**: TMS SSO integration - all user identity managed by external TMS system
- **Deployment**: Railway for both services, Cloudinary for media storage

### Critical: Client-Server Communication

The client and server are **separate services** that communicate via HTTP/WebSocket:

- Server: `http://localhost:8000` (dev) / `https://api.yourdomain.com` (prod)
- Client: `http://localhost:3000` (dev) / `https://yourdomain.com` (prod)
- WebSocket: `ws://localhost:8000/ws` (dev)
- API: `/api/v1/*` endpoints

**CORS must be configured properly** - server's `ALLOWED_ORIGINS` must include client URL.

---

## Development Commands

### Backend (FastAPI)

```bash
# Setup
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Database migrations
alembic revision --autogenerate -m "description"  # Create migration
alembic upgrade head                               # Apply migrations
alembic downgrade -1                               # Rollback one migration
alembic history                                    # View migration history

# Run server
uvicorn app.main:app --reload --port 8000

# Testing
pytest                        # Run all tests
pytest -v                     # Verbose mode
pytest --cov=app              # With coverage
pytest tests/api/v1/test_messages.py  # Specific test file
```

### Frontend (Next.js)

```bash
# Setup
npm install  # or: yarn install / pnpm install

# Development
npm run dev          # Start dev server (http://localhost:3000)

# Testing
npm run test                # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
npm run test MessageBubble  # Specific test

# Code quality
npm run lint                # ESLint
npm run type-check          # TypeScript check
npm run format              # Prettier format
npm run lint && npm run type-check  # Pre-commit check
```

---

## Architecture Patterns

### 1. Feature-Based Structure (Frontend)

**Group by feature, not file type**. Co-locate components, hooks, services, and types:

```
src/features/
├── messaging/
│   ├── components/      # Message-specific components
│   ├── hooks/           # useMessages, useSendMessage, useTyping
│   ├── services/        # messageService.ts (API calls)
│   └── types.ts         # Message types
├── conversations/
│   ├── hooks/           # useConversations, useConversationActions
│   ├── services/        # conversationService.ts
│   └── types.ts
└── calls/
    ├── hooks/           # useWebRTC, useCallState, useMediaDevices
    ├── services/        # callService.ts, signalingService.ts
    └── types.ts
```

### 2. Layered Architecture

**Clear separation of concerns** (never import outer layers from inner layers):

```
Components → Hooks → Services → API
```

- **Components**: UI rendering only (max 300 lines)
- **Hooks**: Business logic and state management (max 200 lines)
- **Services**: API communication (max 500 lines)
- **API Routes**: Thin controllers that delegate to services

### 3. State Management (Zustand)

**Domain-separated stores** (one per major feature):

```typescript
// src/store/
authStore.ts           // Auth state
conversationStore.ts   // Conversations list
messageStore.ts        // Messages per conversation
callStore.ts           // Call state
userStore.ts           // User data (from TMS)
notificationStore.ts   // Notifications
settingsStore.ts       // User settings
```

### 4. WebSocket Management

**Centralized Socket.io connection** (`src/lib/socket.ts`):

- Single socket instance shared across app
- Event listeners in custom hooks (`useSocket`, `useMessages`, `useTyping`)
- Namespace separation: messaging, calls, notifications
- Auto-reconnection with exponential backoff
- Heartbeat/ping-pong every 30 seconds

**Usage pattern**:
```typescript
// In components/hooks
const { messages } = useMessages(conversationId);  // Hook handles socket events

// Socket events (server → client):
// - message:new, message:edit, message:delete
// - typing:start, typing:stop
// - message:delivered, message:read
```

### 5. TMS Integration

**Critical**: TMA relies on TMS for user identity. All user data is view-only.

- **Authentication**: Validate TMS JWT tokens on every request
- **User Data**: Fetch from TMS API and cache in Redis (TTL: 5-15 min)
- **User Sync**: Background sync every 10 minutes
- **Role Mapping**: Map TMS roles to TMA permissions
- **No Local User Management**: Users cannot edit profile - managed by TMS

**API Client Setup** (`src/lib/api.ts`):
```typescript
// Interceptor adds auth token from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

---

## File Organization Rules

### File Size Limits (STRICT)

**If a file exceeds maximum, refactor immediately:**

| File Type | Target | Maximum | Action if Exceeded |
|-----------|--------|---------|-------------------|
| React Components | 150-250 | **300** | Split into sub-components |
| Custom Hooks | 100-150 | **200** | Extract logic to separate hooks |
| Service Files | 300-400 | **500** | Use service composition |
| API Routes | 200-250 | **300** | Keep thin, delegate to services |
| Store/State | 150-200 | **250** | Split by domain |
| Models (SQLAlchemy) | 80-120 | **150** | One model per table |
| Complex Features* | 400-500 | **600** | Only for WebRTC/calls |
| Test Files | 300-500 | 800 | Many test cases OK |

*Complex features exception: WebRTC, voice/video calls only

### How to Keep Files Small

1. **Extract Custom Hooks** - Move logic from components to hooks
2. **Create Sub-Components** - Break complex JSX into smaller components
3. **Service Composition** - Compose small, focused services instead of monolithic ones
4. **Single Responsibility** - One file, one responsibility
5. **Component Limits**: Max 10 props, max 5-7 hooks per component

---

## Viber UI/UX Design

**Critical: This app must look and feel like Viber**

### Color Palette

```css
/* Primary */
--viber-purple: #7360F2          /* Main brand color */
--viber-purple-dark: #665DC1     /* Hover states */
--viber-purple-light: #9B8FFF    /* Active states */
--viber-purple-bg: #F5F3FF       /* Light backgrounds */

/* Message Status */
--viber-sent: #9CA3AF            /* Single check (gray) */
--viber-delivered: #9CA3AF       /* Double check (gray) */
--viber-read: #7360F2            /* Double check (purple) */

/* Status Colors */
--viber-online: #10B981          /* Online (green) */
--viber-away: #F59E0B            /* Away (orange) */
--viber-offline: #6B7280         /* Offline (gray) */
```

### Typography

```css
--font-primary: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
--font-size-xs: 11px      /* Timestamps */
--font-size-sm: 13px      /* Secondary text */
--font-size-base: 15px    /* Body text */
--font-size-lg: 17px      /* Headers */
```

### Layout (Desktop)

```
┌─────────────────────────────────────────────┐
│  App Header (60px)                          │
├──────────┬──────────────────────────────────┤
│          │                                   │
│ Sidebar  │  Chat Area                       │
│ (320px)  │  - Chat Header (60px)            │
│          │  - Messages (flex-1)             │
│          │  - Input Bar (70px)              │
│          │                                   │
└──────────┴──────────────────────────────────┘
```

**Message bubbles**: Sent messages (purple background, right-aligned), received messages (gray background, left-aligned)

---

## Testing Requirements

### Backend (pytest)

- **Target Coverage**: 80%+
- **Test Structure**: Mirror `app/` structure in `tests/`
- **Test Types**: Unit tests (services, repositories), integration tests (API endpoints, TMS integration)

```bash
# Run with coverage report
pytest --cov=app --cov-report=html
```

### Frontend (Jest + React Testing Library)

- **Target Coverage**: 70%+
- **Test Structure**: Mirror `src/` structure in `__tests__/`
- **Focus**: Component rendering, user interactions, hook behavior

```bash
npm run test:coverage
```

### Key Testing Areas

- TMS integration (auth, user sync)
- WebSocket events (message delivery, typing indicators)
- Message CRUD operations
- Conversation management
- Real-time updates

---

## Common Patterns

### Error Handling

**Backend** (FastAPI):
```python
from fastapi import HTTPException

if not conversation:
    raise HTTPException(status_code=404, detail="Conversation not found")
```

**Frontend** (React):
```typescript
try {
  await messageService.send(data);
} catch (error) {
  toast.error("Failed to send message");
  console.error(error);
}
```

### API Response Format

**Consistent structure**:
```json
{
  "success": true,
  "data": {},
  "error": null
}
```

### Database Queries

**Use SQLAlchemy ORM** (never raw SQL):
```python
# Good
messages = db.query(Message).filter(
    Message.conversation_id == conversation_id
).order_by(Message.created_at.desc()).limit(50).all()
```

---

## Code Quality Standards

### Component Design

- Max 10 props per component (group related props into objects)
- Max 5-7 hooks per component
- Extract sub-components when JSX gets deeply nested
- Use composition over conditional rendering complexity

### Git/PR Workflow

- Keep PRs small (<500 lines changed ideal)
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- All tests must pass before merge
- Feature branch workflow: `feature/*`, `bugfix/*`

### TypeScript

- Strict mode enabled
- No `any` types (use `unknown` if truly dynamic)
- Define proper interfaces/types for all data structures

---

## Environment Configuration

### Backend `.env`

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/chatflow
REDIS_URL=redis://localhost:6379
TMS_API_URL=https://tms.example.com
TMS_API_KEY=your-tms-api-key
JWT_SECRET=your-secret-min-32-chars
ALLOWED_ORIGINS=http://localhost:3000
CLOUDINARY_URL=cloudinary://key:secret@cloud_name
MAX_UPLOAD_SIZE=10485760  # 10MB
ENVIRONMENT=development
DEBUG=true
```

### Frontend `.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset
NEXT_PUBLIC_ENVIRONMENT=development
```

---

## Database Schema (Key Tables)

```sql
-- User reference (TMS sync)
users (id, tms_user_id, settings_json, last_synced_at, created_at)

-- Conversations
conversations (id, type, name, avatar_url, created_by, created_at)

-- Conversation members
conversation_members (conversation_id, user_id, role, joined_at, last_read_at)

-- Messages
messages (id, conversation_id, sender_id, content, type, metadata_json,
         reply_to_id, created_at, updated_at, deleted_at, is_edited)

-- Message status
message_status (message_id, user_id, status, timestamp)

-- Calls
calls (id, conversation_id, type, status, started_by, started_at, ended_at)
```

---

## Security Best Practices

- **Token Validation**: Validate TMS JWT on every request
- **Input Validation**: Pydantic schemas (backend), Zod schemas (frontend)
- **SQL Injection Prevention**: Use ORM with parameterized queries
- **XSS Prevention**: Sanitize HTML/script content in messages
- **Rate Limiting**: 100 requests/min per user, 10 messages/sec via WebSocket
- **File Upload Limits**: Max 10MB per file, 5 uploads/min per user
- **CORS**: Whitelist TMS and TMA domains only
- **HTTPS Enforcement**: All production traffic over TLS 1.3

---

## Troubleshooting

### Server won't start
- Check database connection (`DATABASE_URL`)
- Verify Redis is running (`REDIS_URL`)
- Ensure port 8000 is available: `lsof -i :8000`

### Client won't start
- Check Node version (18+ required): `node --version`
- Clear cache: `rm -rf .next node_modules && npm install`
- Ensure port 3000 is available

### CORS errors
- Verify `ALLOWED_ORIGINS` in server `.env` includes client URL
- Restart server after CORS config changes

### WebSocket connection fails
- Check `NEXT_PUBLIC_WS_URL` matches server WebSocket endpoint
- Verify firewall/proxy settings allow WebSocket connections

---

## References

- **Full Specification**: See `TMA.md` for complete feature specs and design system
- **API Docs**: FastAPI auto-generated docs at `http://localhost:8000/docs`
- **Component Library**: shadcn/ui - https://ui.shadcn.com
