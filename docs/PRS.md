# Product Requirements Specification (PRS)

## GCG Team Messaging Application (TMA) - Technical Specification

---

## 1. Introduction

### 1.1 Purpose

This Product Requirements Specification (PRS) provides the technical blueprint for implementing the features described in the PRD. It translates business requirements into technical specifications that developers can follow, while remaining accessible to non-technical stakeholders who want to understand how features will be built.

### 1.2 Scope

This document covers:
- System architecture and technology choices
- Technical implementation of each feature
- Data storage and security measures
- Integration specifications
- Performance and scalability considerations

### 1.3 Reference Documents

| Document | Description |
|----------|-------------|
| PRD.md | Product Requirements Document |
| CLAUDE.md | Development guidelines and standards |
| TMA.md | Full feature specifications |

---

## 2. System Architecture

### 2.1 High-Level Architecture

The TMA system uses a modern **two-service architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                          │
│                     (Chrome, Firefox, Edge)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTPS / WebSocket (Secure)
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                      RAILWAY CLOUD PLATFORM                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    TMA CLIENT (Frontend)                 │   │
│  │           Modern web application users interact with      │   │
│  │                      Port: 3000                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              │ API Calls + Real-time Connection │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    TMA SERVER (Backend)                  │   │
│  │           Handles all business logic and data            │   │
│  │                      Port: 8000                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐              │
│          │                   │                   │              │
│  ┌───────▼───────┐   ┌───────▼───────┐   ┌──────▼──────┐       │
│  │   PostgreSQL  │   │     Redis     │   │  Alibaba    │       │
│  │   (Database)  │   │    (Cache)    │   │ Cloud OSS   │       │
│  │ Stores all    │   │ Fast lookups  │   │ File Storage│       │
│  │ messages/users│   │ & sessions    │   │ Images/Docs │       │
│  └───────────────┘   └───────────────┘   └─────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User Authentication
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                    GCG TEAM MANAGEMENT SYSTEM                    │
│                  (Existing employee directory)                   │
│               Provides: Login, User Data, Org Chart             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Why This Architecture?

| Component | Purpose | Benefit to Users |
|-----------|---------|------------------|
| **Separate Frontend/Backend** | Frontend handles display, backend handles data | Faster updates, better performance |
| **Cloud Hosting** | Servers run in professional data centers | Always available, fast globally |
| **PostgreSQL Database** | Reliable data storage | Messages never lost |
| **Redis Cache** | Super-fast temporary storage | Instant online status updates |
| **Cloud File Storage** | Dedicated file handling | Fast image/file uploads |

---

## 3. Technology Stack

### 3.1 Frontend (What Users See)

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Next.js 15** | Web application framework | Modern, fast, used by Netflix, TikTok |
| **React 18** | User interface library | Industry standard, smooth interactions |
| **TypeScript** | Programming language | Catches errors before users see them |
| **TailwindCSS** | Styling system | Consistent, beautiful design |
| **shadcn/ui** | Pre-built components | Professional look, accessible |
| **Zustand** | State management | Keeps app data organized |
| **Socket.io Client** | Real-time connection | Instant message delivery |
| **TanStack Query** | Data fetching | Efficient loading, automatic caching |

### 3.2 Backend (Behind the Scenes)

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Python 3.12** | Programming language | Readable, maintainable code |
| **FastAPI** | Server framework | Fast, auto-generates documentation |
| **SQLAlchemy 2.0** | Database toolkit | Safe database operations |
| **PostgreSQL** | Main database | Reliable, proven, scalable |
| **Redis** | Fast cache | Real-time features, sessions |
| **Socket.io (Python)** | WebSocket server | Real-time messaging |
| **Alibaba Cloud OSS** | File storage | Reliable, fast delivery |

### 3.3 Infrastructure

| Service | Purpose | Provider |
|---------|---------|----------|
| **Application Hosting** | Run the servers | Railway |
| **Database** | Store messages/users | Railway PostgreSQL |
| **Cache** | Fast data access | Alibaba Cloud Redis |
| **File Storage** | Images and documents | Alibaba Cloud OSS |
| **SSL/HTTPS** | Secure connections | Railway (automatic) |

---

## 4. Feature Technical Specifications

### 4.1 User Authentication

#### How Login Works (Technical Flow)

```
User clicks "Login"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Check if already logged into TMS                    │
│ - Browser sends request to TMA Server                       │
│ - TMA Server checks for TMS session cookie                  │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Validate with TMS                                   │
│ - TMA Server asks TMS: "Is this user valid?"               │
│ - TMS confirms user identity and sends user data            │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Create TMA Session                                  │
│ - TMA Server creates secure token (like a digital badge)    │
│ - Token stored in browser (lasts 24 hours)                  │
│ - User is now logged in!                                    │
└─────────────────────────────────────────────────────────────┘
```

#### Security Measures

| Measure | What It Does |
|---------|--------------|
| **JWT Tokens** | Digital ID cards that expire after 24 hours |
| **HTTPS Only** | All data encrypted during transmission |
| **One-Time Codes** | Login codes can only be used once |
| **Token Validation** | Every request verified server-side |

### 4.2 Real-Time Messaging

#### How Instant Messaging Works

Traditional websites: Browser asks server → Server responds → Page updates
**TMA approach:** Constant open connection → Server pushes updates instantly

```
┌──────────────────┐          ┌──────────────────┐
│   Your Browser   │◄────────►│    TMA Server    │
│                  │          │                  │
│  WebSocket       │          │  WebSocket       │
│  Connection      │          │  Connection      │
│  (Always Open)   │          │  (Always Open)   │
└──────────────────┘          └──────────────────┘
        │                              │
        │  1. You send a message       │
        │─────────────────────────────►│
        │                              │
        │  2. Server saves to database │
        │                              │
        │  3. Server sends to recipient│
        │◄─────────────────────────────│
        │                              │
        │  4. Both see message instantly│
```

#### WebSocket Events (Real-Time Notifications)

| Event | What Triggers It | What Happens |
|-------|------------------|--------------|
| `message:new` | Someone sends a message | Message appears in chat |
| `message:edit` | Someone edits a message | Message updates in place |
| `message:delete` | Someone deletes a message | Message disappears/shows deleted |
| `typing:start` | Someone starts typing | "User is typing..." appears |
| `typing:stop` | Someone stops typing | Typing indicator disappears |
| `user_online` | Someone opens the app | Green dot appears on their avatar |
| `user_offline` | Someone closes the app | Green dot disappears |
| `reaction:added` | Someone reacts to message | Emoji appears on message |

### 4.3 Message Storage

#### Database Structure (Simplified)

**Messages Table:**
```
┌─────────────────────────────────────────────────────────────────┐
│ MESSAGES TABLE                                                   │
├──────────────────┬──────────────────────────────────────────────┤
│ id               │ Unique identifier for each message           │
│ conversation_id  │ Which chat this message belongs to           │
│ sender_id        │ Who sent the message                         │
│ content          │ The actual message text                      │
│ type             │ TEXT, IMAGE, FILE, VOICE, POLL, SYSTEM       │
│ status           │ SENT, DELIVERED, READ                        │
│ created_at       │ When the message was sent                    │
│ updated_at       │ When the message was last edited             │
│ is_edited        │ Whether message was modified                 │
│ reply_to_id      │ If replying to another message, which one    │
└──────────────────┴──────────────────────────────────────────────┘
```

**Conversations Table:**
```
┌─────────────────────────────────────────────────────────────────┐
│ CONVERSATIONS TABLE                                              │
├──────────────────┬──────────────────────────────────────────────┤
│ id               │ Unique identifier for each conversation      │
│ type             │ DM (two people) or GROUP (multiple people)   │
│ name             │ Group name (null for direct messages)        │
│ avatar_url       │ Group photo URL                              │
│ created_by       │ Who created the conversation                 │
│ created_at       │ When the conversation started                │
└──────────────────┴──────────────────────────────────────────────┘
```

#### How Messages Are Ordered

Each message gets a **sequence number** to ensure correct ordering:
- Message 1 → Sequence: 1
- Message 2 → Sequence: 2
- Message 3 → Sequence: 3

This prevents messages from appearing out of order even if there are network delays.

### 4.4 File Upload System

#### Upload Process

```
User selects file
        │
        ▼
┌─────────────────────────────────────────┐
│ Step 1: Validate File                   │
│ - Check file size (max 100MB)           │
│ - Check file type (images, PDFs, etc.)  │
│ - Show error if invalid                 │
└─────────────────────────────┬───────────┘
                              │
                              ▼
┌─────────────────────────────────────────┐
│ Step 2: Upload to Cloud Storage         │
│ - File sent to Alibaba Cloud OSS        │
│ - Progress bar shows upload status      │
│ - Cloud returns secure URL              │
└─────────────────────────────┬───────────┘
                              │
                              ▼
┌─────────────────────────────────────────┐
│ Step 3: Create Message                  │
│ - Message saved with file URL           │
│ - Thumbnail generated for images        │
│ - Message appears in conversation       │
└─────────────────────────────────────────┘
```

#### Supported File Types

| Category | Formats | Max Size |
|----------|---------|----------|
| Images | JPEG, PNG, GIF, WebP | 100MB |
| Documents | PDF, DOC, DOCX, XLS, XLSX | 100MB |
| Videos | MP4, WebM | 100MB |
| Audio/Voice | WebM, MP3, OGG | 100MB |

### 4.5 Message Status Flow

#### How Read Receipts Work

```
You send a message
        │
        ▼ ─────────────────────────────────────────
        │  Status: SENT (✓)
        │  Message saved to server
        │
        ▼ ─────────────────────────────────────────
        │  Status: DELIVERED (✓✓)
        │  Recipient's app received the message
        │
        ▼ ─────────────────────────────────────────
        │  Status: READ (✓✓ purple)
        │  Recipient viewed the conversation
```

### 4.6 Online Status System

#### How We Know Who's Online

```
┌──────────────────────────────────────────────────────────────┐
│                         REDIS CACHE                          │
│                    (Super-fast memory)                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   User: john@gcg.com      Status: ONLINE    Expires: 5min   │
│   User: jane@gcg.com      Status: ONLINE    Expires: 5min   │
│   User: bob@gcg.com       Status: OFFLINE   (no entry)      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- When you open the app → Your status set to ONLINE
- Every 30 seconds → Status refreshed (heartbeat)
- When you close the app → Status set to OFFLINE
- After 5 minutes of no heartbeat → Automatically marked OFFLINE

### 4.7 Notification System

#### Notification Flow

```
New message arrives
        │
        ▼
┌─────────────────────────────────────────┐
│ Check user preferences                  │
│ - Is user in Do Not Disturb mode?       │
│ - Is this conversation muted?           │
│ - Are notifications enabled?            │
└─────────────────────────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ In-App  │     │  Sound  │     │ Browser │
        │  Toast  │     │  Alert  │     │ Desktop │
        └─────────┘     └─────────┘     └─────────┘
```

---

## 5. API Endpoints

### 5.1 API Structure

All API calls go through: `https://api.tma.gcg.com/api/v1/`

### 5.2 Main Endpoints

#### Authentication
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login/sso` | POST | Login with TMS credentials |
| `/auth/me` | GET | Get current user info |
| `/auth/logout` | POST | Log out of the app |

#### Messages
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/messages` | POST | Send a new message |
| `/messages` | GET | Get messages in a conversation |
| `/messages/{id}` | PUT | Edit a message |
| `/messages/{id}` | DELETE | Delete a message |
| `/messages/{id}/reactions` | POST | Add emoji reaction |
| `/messages/search` | GET | Search messages |

#### Conversations
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/conversations` | POST | Create new conversation |
| `/conversations` | GET | List all your conversations |
| `/conversations/{id}` | GET | Get conversation details |
| `/conversations/{id}` | PUT | Update conversation settings |
| `/conversations/{id}/members` | POST | Add members to group |
| `/conversations/{id}/leave` | POST | Leave a group |

#### Users
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users/search` | GET | Search for users |
| `/users/{id}` | GET | Get user profile |
| `/users/online` | GET | Get list of online users |

#### Polls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/polls` | POST | Create a poll |
| `/polls/{id}/vote` | POST | Vote on a poll |

---

## 6. Data Flow Examples

### 6.1 Sending a Message

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER ACTION                                                  │
│    - User types "Hello!" and clicks Send                        │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND OPTIMISTIC UPDATE                                   │
│    - Message appears immediately in chat (gray, "sending...")   │
│    - User sees instant feedback                                 │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. API REQUEST                                                  │
│    - Frontend sends message to server via WebSocket             │
│    - Includes: content, conversation_id, sender_id              │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SERVER PROCESSING                                            │
│    - Validate user permission to post                           │
│    - Assign sequence number                                     │
│    - Save to PostgreSQL database                                │
│    - Update conversation's last_message_at                      │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. REAL-TIME BROADCAST                                          │
│    - Server sends message:new event to all participants         │
│    - Original sender gets confirmation (status: SENT)           │
│    - Recipients see new message appear                          │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. DELIVERY CONFIRMATION                                        │
│    - When recipient's client receives → status: DELIVERED       │
│    - When recipient opens chat → status: READ                   │
│    - Sender sees checkmarks update in real-time                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Creating a Group Chat

```
User clicks "New Group"
        │
        ├── Enter group name: "Marketing Team"
        ├── Select members: John, Jane, Bob
        ├── (Optional) Upload group photo
        │
        ▼
┌─────────────────────────────────────────┐
│ SERVER ACTIONS:                         │
│ 1. Create conversation record           │
│ 2. Add all members to conversation      │
│ 3. Set creator as admin                 │
│ 4. Create system message: "Group created│
│ 5. Notify all members via WebSocket     │
└─────────────────────────────────────────┘
        │
        ▼
All members see the new group in their list
```

---

## 7. Performance Specifications

### 7.1 Response Time Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Send message | < 100ms | 500ms |
| Load conversation | < 300ms | 1 second |
| Search messages | < 500ms | 2 seconds |
| File upload (10MB) | < 5 seconds | 15 seconds |
| Online status update | < 50ms | 200ms |

### 7.2 Rate Limiting

To prevent abuse and ensure fair usage:

| Limit | Value | Why |
|-------|-------|-----|
| Messages per minute | 30 | Prevent spam |
| API requests per minute | 100 | Server protection |
| File uploads per minute | 5 | Bandwidth management |
| Max concurrent connections | 10,000 | Server capacity |

### 7.3 Caching Strategy

| Data | Cache Location | Duration | Why |
|------|----------------|----------|-----|
| User profiles | Redis | 10 minutes | Reduce TMS API calls |
| Online status | Redis | 5 minutes | Real-time accuracy |
| Session tokens | Redis | 24 hours | Quick authentication |
| Recent messages | Browser | 5 minutes | Faster loading |

---

## 8. Security Implementation

### 8.1 Authentication Security

| Measure | Implementation |
|---------|----------------|
| Password hashing | bcrypt with salt (handled by TMS) |
| Token signing | HMAC-SHA256 algorithm |
| Token expiration | 24 hours |
| Token refresh | Automatic before expiry |
| Session invalidation | On logout or password change |

### 8.2 Data Protection

| Measure | Implementation |
|---------|----------------|
| Transport encryption | TLS 1.3 (HTTPS) |
| Data at rest | PostgreSQL encryption |
| File storage | Alibaba Cloud OSS encryption |
| API validation | Pydantic schema validation |
| SQL injection prevention | SQLAlchemy ORM (parameterized queries) |
| XSS prevention | Content sanitization |

### 8.3 Access Control

```
┌─────────────────────────────────────────────────────────────────┐
│ PERMISSION CHECKS (Every Request)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Is token valid?                                              │
│  ✓ Is user active in TMS?                                       │
│  ✓ Is user a member of this conversation?                       │
│  ✓ Does user have permission for this action?                   │
│  ✓ Is the target user not blocked?                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Scalability Considerations

### 9.1 Current Capacity

| Metric | Capacity |
|--------|----------|
| Concurrent users | <30 |
| File storage | 40GB |
| Database size | 50GB |

### 9.2 Scaling Strategy

```
Current: Single Server
        │
        ▼ (if needed)
┌─────────────────────────────────────────┐
│ Horizontal Scaling:                     │
│ - Multiple server instances             │
│ - Load balancer distributes traffic     │
│ - Redis cluster for shared state        │
│ - Database read replicas                │
└─────────────────────────────────────────┘
```

---

## 10. Integration Specifications

### 10.1 TMS Integration

**Connection Details:**
- API URL: Configured via environment variable
- Authentication: API key + JWT tokens
- Data synced: User profile, organization hierarchy
- Sync frequency: On login + every 24 hours

**Data Mapping:**

| TMS Field | TMA Field |
|-----------|-----------|
| id | tms_user_id |
| email | email |
| firstName | first_name |
| lastName | last_name |
| profileImage | image |
| role | role |
| position | position_title |
| division | division |
| department | department |
| section | section |

### 10.2 Cloud Storage Integration

**Alibaba Cloud OSS:**
- Region: Configured per deployment
- Bucket: Dedicated for TMA
- Access: Signed URLs (time-limited)
- CDN: Enabled for fast global delivery

---

## 11. Error Handling

### 11.1 Error Response Format

All API errors return consistent format:
```json
{
  "success": false,
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "The conversation you're looking for doesn't exist",
    "hint": "Check the conversation ID and try again"
  }
}
```

### 11.2 Common Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| UNAUTHORIZED | 401 | Not logged in or session expired |
| FORBIDDEN | 403 | No permission for this action |
| NOT_FOUND | 404 | Resource doesn't exist |
| RATE_LIMITED | 429 | Too many requests, slow down |
| SERVER_ERROR | 500 | Something went wrong on our end |

### 11.3 Retry Strategy

```
Request fails
        │
        ▼
┌─────────────────────────────────────────┐
│ Automatic retry with exponential backoff│
│                                         │
│ Attempt 1: Wait 1 second                │
│ Attempt 2: Wait 2 seconds               │
│ Attempt 3: Wait 4 seconds               │
│ After 3 failures: Show error to user    │
└─────────────────────────────────────────┘
```



## 12. Deployment

### 12.1 Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local testing | localhost:3000/8000 |
| Staging | Pre-production testing | staging.tma.gcg.com |
| Production | Live users | tma.gcg.com |

### 12.2 Deployment Process

```
Developer pushes code
        │
        ▼
┌─────────────────────────────────────────┐
│ 1. Automated tests run                  │
│ 2. Code review approved                 │
│ 3. Merge to main branch                 │
│ 4. Railway auto-deploys                 │
│ 5. Health checks verify deployment      │
│ 6. Users automatically get new version  │
└─────────────────────────────────────────┘
```

---

## 13. Monitoring & Observability

### 13.1 Health Checks

| Endpoint | Checks |
|----------|--------|
| `/health` | Server is responding |
| `/health/ready` | Database connected, Redis connected, TMS reachable |
| `/health/websocket` | WebSocket server running |

### 13.2 Logging

| Log Level | What's Logged |
|-----------|---------------|
| ERROR | Failures, exceptions |
| WARN | Potential issues |
| INFO | Important events (logins, messages) |
| DEBUG | Detailed debugging (development only) |



## 14. Glossary of Technical Terms

| Term | Simple Explanation |
|------|---------------------|
| **API** | How the app talks to the server (like a waiter taking orders) |
| **WebSocket** | Always-open connection for instant updates |
| **JWT** | Digital ID card that proves who you are |
| **PostgreSQL** | Database that stores all messages |
| **Redis** | Super-fast memory for temporary data |
| **HTTPS** | Secure, encrypted connection |
| **CDN** | Network of servers for fast file delivery |
| **SSO** | Single Sign-On (one login for all apps) |
| **ORM** | Tool that makes database queries safe |
| **Cache** | Temporary storage for frequently used data |

---

## 15. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 23, 2026 | GCG Development Team | Initial document |

---

## 16. Appendix

### A. Environment Variables Reference

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=https://api.tma.gcg.com/api/v1
NEXT_PUBLIC_WS_URL=https://api.tma.gcg.com
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_ENVIRONMENT=production
```

**Backend (.env):**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
USER_MANAGEMENT_API_URL=https://tms.gcg.com/api
JWT_SECRET=your-secret-key
ALLOWED_ORIGINS=https://tma.gcg.com
```

### B. API Response Examples

**Successful Message Send:**
```json
{
  "success": true,
  "data": {
    "id": "msg_abc123",
    "content": "Hello team!",
    "status": "sent",
    "createdAt": "2026-01-23T10:30:00Z"
  }
}
```

**Conversation List:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_123",
        "type": "group",
        "name": "Marketing Team",
        "unreadCount": 5,
        "lastMessage": {
          "content": "Meeting at 3pm",
          "createdAt": "2026-01-23T14:00:00Z"
        }
      }
    ],
    "nextCursor": "cursor_xyz"
  }
}
```

---

**Technical Approval:**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Lead Developer | | | |
| DevOps Engineer | | | |
| Security Officer | | | |
| Technical Architect | | | |
