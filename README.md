# GCG Team Messaging App - Client

A Viber-inspired team messaging application integrated with Team Management System (TMS), built with Next.js 15.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (v20.12.0 recommended)
- npm, yarn, or pnpm
- Access to TMS API (for authentication)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Configure environment variables in .env.local
# - NEXT_PUBLIC_API_URL: Backend API URL
# - NEXT_PUBLIC_WS_URL: WebSocket server URL
# - NEXT_PUBLIC_CLOUDINARY_*: Cloudinary credentials

# Start development server
npm run dev
```

The application will be running at `http://localhost:3000`

## 📁 Project Structure

```
src/
├── app/                          # Next.js 15 App Router
│   ├── (auth)/                   # Auth route group
│   │   └── login/
│   ├── (main)/                   # Main app route group
│   │   ├── chats/
│   │   ├── calls/
│   │   ├── contacts/
│   │   └── settings/
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
│
├── components/                   # React components (MAX 300 lines!)
│   ├── chat/                     # Message-related components
│   ├── call/                     # Call-related components
│   ├── poll/                     # Poll components
│   ├── ui/                       # shadcn/ui components
│   ├── layout/                   # Layout components
│   └── shared/                   # Shared components
│
├── features/                     # Feature modules (co-located)
│   ├── messaging/
│   │   ├── hooks/                # useMessages, useSendMessage, etc.
│   │   ├── services/             # messageService.ts
│   │   └── types.ts
│   ├── conversations/
│   ├── calls/
│   ├── auth/
│   └── files/
│
├── hooks/                        # Shared/global hooks
│   ├── useSocket.ts
│   ├── useDebounce.ts
│   └── ...
│
├── lib/                          # Libraries/utilities
│   ├── socket.ts                 # Socket.io setup
│   ├── api.ts                    # API client
│   ├── utils.ts                  # General utilities
│   ├── cn.ts                     # classNames utility
│   └── constants.ts              # App constants
│
├── store/                        # Zustand stores (one per domain)
│   ├── authStore.ts
│   ├── conversationStore.ts
│   ├── messageStore.ts
│   └── ...
│
├── types/                        # TypeScript types
│   ├── index.ts
│   ├── message.ts
│   ├── conversation.ts
│   ├── user.ts
│   └── ...
│
└── utils/                        # Utility functions
    ├── date.ts
    ├── format.ts
    └── validation.ts
```

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)

# Testing
npm run test             # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# Code Quality
npm run lint             # ESLint
npm run type-check       # TypeScript check
npm run format           # Prettier format
npm run lint && npm run type-check  # Pre-commit check

# Build
npm run build            # Production build
npm start                # Start production server
```

## 🎨 Viber Design System

This app follows the Viber UI/UX design system:

### Color Palette

- **Primary Purple**: `#7360F2`
- **Message Status**: Gray (sent/delivered), Purple (read)
- **Online Status**: Green `#10B981`
- **Offline Status**: Gray `#6B7280`

### Typography

- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Sizes: 11px (timestamps), 13px (secondary), 15px (body), 17px (headers)

### Layout

- **Desktop**: Sidebar (320px) + Chat Area
- **Mobile**: Full-screen with bottom navigation

See `docs/TMA.md` for complete design specifications (internal only).

## 🏗️ Architecture

### Feature-Based Structure

Code is organized by feature (not file type):

```
features/messaging/
├── components/       # Message-specific components
├── hooks/            # useMessages, useSendMessage
├── services/         # messageService.ts
└── types.ts          # Message types
```

### Layered Architecture

Clear separation of concerns:

```
Components → Hooks → Services → API
```

- **Components**: UI rendering only (max 300 lines)
- **Hooks**: Business logic and state management
- **Services**: API communication
- **API Client**: HTTP/WebSocket layer

### State Management (Zustand)

Domain-separated stores:

- `authStore.ts` - Authentication state
- `conversationStore.ts` - Conversations list
- `messageStore.ts` - Messages per conversation
- `callStore.ts` - Call state
- `userStore.ts` - User data (from TMS)

### WebSocket Management

Centralized Socket.io connection:

- Single socket instance shared across app
- Event listeners in custom hooks
- Auto-reconnection with exponential backoff

## 🔗 TMS Integration

**Critical**: This app relies on TMS for user identity and authentication.

- All user data is fetched from TMS API
- Users cannot edit profile (managed by TMS)
- JWT tokens from TMS validate every request
- User data cached in Redis (5-15 min TTL)

## 📏 File Organization Rules

**STRICT file size limits:**

| File Type | Maximum Lines |
|-----------|---------------|
| React Components | 300 |
| Custom Hooks | 200 |
| Service Files | 500 |
| Store/State | 250 |

**If a file exceeds maximum, refactor immediately!**

## 🧪 Testing

Target coverage:
- **Frontend**: 70%+
- **Backend**: 80%+

Test structure mirrors `src/` structure:

```
__tests__/
├── components/
├── hooks/
└── services/
```

## 🔒 Security

- Token validation on every request
- Input validation (Zod schemas)
- XSS prevention (sanitized content)
- Rate limiting (100 req/min per user)
- File upload limits (10MB max)

## 📚 Documentation

- **Code Guidelines**: See `CLAUDE.md` for development guidelines
- **API Docs**: Backend at `/docs` endpoint when running locally

## 🤝 Contributing

1. Follow file size limits
2. Use conventional commits: `feat:`, `fix:`, `docs:`, etc.
3. Keep PRs small (<500 lines changed)
4. All tests must pass before merge
5. Feature branch workflow: `feature/*`, `bugfix/*`

## 📝 License

Private/Internal Project - GCG Team
