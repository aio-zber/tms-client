# TMS Frontend Integration - Complete Guide

## Overview

This document describes the frontend implementation for integrating Team Management System (TMS) user data into the Team Messaging Application client.

## Architecture

### Component Structure

```
src/
├── types/
│   └── user.ts                    # User types, interfaces, utility functions
├── lib/
│   ├── apiClient.ts              # HTTP client with auth
│   └── constants.ts              # API URLs and configuration
├── features/
│   └── users/
│       ├── services/
│       │   └── userService.ts    # API calls for user data
│       ├── hooks/
│       │   ├── useCurrentUser.ts # Hook for authenticated user
│       │   ├── useUser.ts        # Hook for fetching individual users
│       │   └── useUserSearch.ts  # Hook for searching users
│       └── index.ts              # Feature exports
└── store/
    └── userStore.ts              # Zustand store for user state
```

## Type Definitions

### Core Types

Located in `src/types/user.ts`:

#### TMSRole
```typescript
type TMSRole = 'ADMIN' | 'LEADER' | 'MEMBER';
```

#### User Interface
```typescript
interface User {
  // Identifiers
  id: string;                  // Local database UUID
  tmsUserId: string;          // TMS user ID (primary)

  // Basic info
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  name?: string;
  displayName: string;        // Computed
  image?: string;

  // Organization
  role: TMSRole;
  positionTitle?: string;
  division?: string;
  department?: string;
  section?: string;
  customTeam?: string;
  hierarchyLevel?: string;
  reportsToId?: string;

  // Status
  isActive: boolean;
  isLeader: boolean;

  // Settings (local)
  settings?: UserSettings;

  // Timestamps
  createdAt: string;
  lastSyncedAt?: string;
}
```

### Utility Functions

```typescript
// Map TMS role to internal role
mapTMSRole(tmsRole: TMSRole): UserRole

// Get display name with fallbacks
getUserDisplayName(user: Partial<User>): string

// Get user initials for avatar
getUserInitials(user: Partial<User>): string

// Check if user is admin
isAdmin(user: User): boolean

// Check if user is leader
isLeader(user: User): boolean

// Get organizational path
getOrganizationPath(user: User): string
```

## API Client

### Configuration

Located in `src/lib/apiClient.ts`:

```typescript
import { apiClient } from '@/lib/apiClient';

// GET request
const user = await apiClient.get<User>('/users/me');

// POST request
const result = await apiClient.post('/users/sync', { force: true });

// With query parameters
const users = await apiClient.get<User[]>('/users', {
  q: 'john',
  division: 'Engineering',
  limit: 10
});
```

### Features

- ✅ Automatic JWT token injection
- ✅ Error handling with typed errors
- ✅ Request/response type safety
- ✅ File upload support
- ✅ Query parameter building

## User Service

Located in `src/features/users/services/userService.ts`:

### Methods

#### getCurrentUser()
```typescript
const user = await userService.getCurrentUser();
```
Fetches current authenticated user from `/api/v1/users/me`. Automatically caches result in localStorage.

#### getUserById(userId)
```typescript
const user = await userService.getUserById('user-123');
```
Fetches user by ID (local or TMS).

#### searchUsers(params)
```typescript
const users = await userService.searchUsers({
  query: 'john',
  filters: {
    division: 'Engineering',
    isActive: true
  },
  limit: 10
});
```
Searches users with optional filters.

#### syncUsers(userIds, force) - Admin Only
```typescript
const result = await userService.syncUsers(['tms-123', 'tms-456'], true);
// Returns: { success, synced_count, failed_count, errors }
```

#### getCachedCurrentUser()
```typescript
const cachedUser = userService.getCachedCurrentUser();
```
Gets user from localStorage without API call.

## Zustand Store

Located in `src/store/userStore.ts`:

### State Structure

```typescript
interface UserState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  users: Record<string, User>;    // User cache
  searchResults: UserSearchResult[];
  searchQuery: string;
  isSearching: boolean;
}
```

### Direct Store Usage

```typescript
import { useUserStore } from '@/store/userStore';

function Component() {
  const currentUser = useUserStore((state) => state.currentUser);
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  return <div>{currentUser?.displayName}</div>;
}
```

### Selectors (Optimized)

```typescript
import { useUserStore, selectCurrentUser, selectIsAuthenticated } from '@/store/userStore';

const currentUser = useUserStore(selectCurrentUser);
const isAuthenticated = useUserStore(selectIsAuthenticated);
```

## Custom Hooks

### useCurrentUser()

Get and manage current authenticated user.

```typescript
import { useCurrentUser } from '@/features/users';

function ProfilePage() {
  const { user, isLoading, error, refetch, logout } = useCurrentUser();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <LoginPrompt />;

  return (
    <div>
      <h1>Welcome, {user.displayName}</h1>
      <p>{user.email}</p>
      <p>{user.positionTitle}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

**Props:**
- `autoFetch: boolean` (default: true) - Auto-fetch on mount

**Returns:**
- `user: User | null` - Current user
- `isAuthenticated: boolean` - Auth status
- `isLoading: boolean` - Loading state
- `error: string | null` - Error message
- `refetch: () => Promise<void>` - Manually refetch
- `updateUser: (updates: Partial<User>) => void` - Update user
- `logout: () => void` - Logout user

### useUser(userId)

Fetch and cache individual user by ID.

```typescript
import { useUser } from '@/features/users';

function UserCard({ userId }: { userId: string }) {
  const { user, isLoading, error } = useUser(userId);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState />;
  if (!user) return <NotFound />;

  return (
    <div className="user-card">
      <Avatar src={user.image} alt={user.displayName} />
      <h3>{user.displayName}</h3>
      <p>{user.positionTitle}</p>
      <p>{user.division} > {user.department}</p>
    </div>
  );
}
```

**Props:**
- `userId: string | null | undefined` - User ID to fetch
- `autoFetch: boolean` (default: true) - Auto-fetch if not cached

**Returns:**
- `user: User | null` - User data
- `isLoading: boolean` - Loading state
- `error: string | null` - Error message

**Caching:** Automatically caches users in store. Subsequent calls with same ID return cached data instantly.

### useUserSearch()

Search users with debouncing.

```typescript
import { useUserSearch } from '@/features/users';

function UserSearchDialog() {
  const {
    query,
    results,
    isSearching,
    error,
    search,
    clearSearch,
    setFilters
  } = useUserSearch();

  return (
    <Dialog>
      <SearchInput
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search users..."
      />

      <FilterPanel>
        <Select
          value={filters?.division}
          onChange={(v) => setFilters({ division: v })}
        >
          <option value="">All Divisions</option>
          <option value="Engineering">Engineering</option>
          <option value="Sales">Sales</option>
        </Select>
      </FilterPanel>

      {isSearching && <LoadingSpinner />}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <UserList>
        {results.map((user) => (
          <UserListItem key={user.id} user={user} />
        ))}
      </UserList>

      {results.length === 0 && query && !isSearching && (
        <EmptyState>No users found</EmptyState>
      )}
    </Dialog>
  );
}
```

**Props:**
- `initialFilters?: UserSearchFilters` - Initial filters
- `debounceMs: number` (default: 500) - Debounce delay

**Returns:**
- `query: string` - Current search query
- `results: UserSearchResult[]` - Search results
- `isSearching: boolean` - Loading state
- `error: string | null` - Error message
- `filters: UserSearchFilters | undefined` - Current filters
- `limit: number` - Result limit
- `search: (query: string) => void` - Search with debounce
- `searchImmediate: () => void` - Search without debounce
- `clearSearch: () => void` - Clear results
- `setFilters: (filters: UserSearchFilters) => void` - Update filters
- `setLimit: (limit: number) => void` - Update limit

**Debouncing:** Automatically debounces search input to avoid excessive API calls (default: 500ms).

## Example Components

### User Avatar Component

```typescript
import { useUser } from '@/features/users';
import { getUserInitials } from '@/types/user';

interface UserAvatarProps {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ userId, size = 'md' }: UserAvatarProps) {
  const { user, isLoading } = useUser(userId);

  if (isLoading) {
    return <Skeleton className={`avatar-${size}`} />;
  }

  if (!user) {
    return <div className={`avatar-${size} avatar-placeholder`}>?</div>;
  }

  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.displayName}
        className={`avatar-${size}`}
      />
    );
  }

  return (
    <div className={`avatar-${size} avatar-initials`}>
      {getUserInitials(user)}
    </div>
  );
}
```

### User Picker Component

```typescript
import { useUserSearch } from '@/features/users';

interface UserPickerProps {
  onSelect: (user: UserSearchResult) => void;
  filters?: UserSearchFilters;
}

export function UserPicker({ onSelect, filters }: UserPickerProps) {
  const {
    query,
    results,
    isSearching,
    search,
    clearSearch
  } = useUserSearch(filters);

  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (user: UserSearchResult) => {
    onSelect(user);
    clearSearch();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button>Select User</Button>
      </PopoverTrigger>

      <PopoverContent>
        <Command>
          <CommandInput
            value={query}
            onValueChange={search}
            placeholder="Search users..."
          />

          <CommandList>
            {isSearching && (
              <CommandEmpty>Searching...</CommandEmpty>
            )}

            {!isSearching && results.length === 0 && query && (
              <CommandEmpty>No users found</CommandEmpty>
            )}

            <CommandGroup>
              {results.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  onSelect={() => handleSelect(user)}
                >
                  <UserAvatar userId={user.id} size="sm" />
                  <div>
                    <div>{user.name || user.email}</div>
                    <div className="text-xs text-muted">
                      {user.positionTitle}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

### Organization Hierarchy Display

```typescript
import { useUser } from '@/features/users';
import { getOrganizationPath } from '@/types/user';

export function UserOrganization({ userId }: { userId: string }) {
  const { user } = useUser(userId);

  if (!user) return null;

  return (
    <div className="organization-info">
      <h3>Organization</h3>
      <div className="org-path">
        {getOrganizationPath(user)}
      </div>
      <div className="org-details">
        <div>
          <label>Role:</label>
          <span>{user.role}</span>
        </div>
        <div>
          <label>Position:</label>
          <span>{user.positionTitle}</span>
        </div>
        {user.isLeader && (
          <Badge variant="secondary">Team Leader</Badge>
        )}
      </div>
    </div>
  );
}
```

## Authentication Flow

### 1. App Initialization

```typescript
// In your root layout or app component
import { useCurrentUser } from '@/features/users';

export default function RootLayout({ children }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppLayout>{children}</AppLayout>;
}
```

### 2. Protected Routes

```typescript
import { useCurrentUser } from '@/features/users';
import { isAdmin } from '@/types/user';

export function AdminRoute({ children }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) return <LoadingScreen />;

  if (!user || !isAdmin(user)) {
    return <Navigate to="/unauthorized" />;
  }

  return <>{children}</>;
}
```

### 3. Logout

```typescript
import { useCurrentUser } from '@/features/users';

export function LogoutButton() {
  const { logout } = useCurrentUser();

  const handleLogout = () => {
    logout();
    // Clear auth token
    localStorage.removeItem('auth_token');
    // Redirect to login
    window.location.href = '/login';
  };

  return <Button onClick={handleLogout}>Logout</Button>;
}
```

## Caching Strategy

### Client-Side Caching

1. **Zustand Store** - In-memory cache during session
2. **localStorage** - Persistent cache for current user
3. **Automatic Invalidation** - On user update or logout

### Cache Keys

```typescript
// localStorage
STORAGE_KEYS.AUTH_TOKEN    // JWT token
STORAGE_KEYS.USER_DATA     // Current user

// Zustand store
users[userId]              // User cache by ID
users[tmsUserId]           // Also by TMS ID
```

### Cache Behavior

- **Current User**: Cached in localStorage + Zustand
- **Individual Users**: Cached in Zustand only
- **Search Results**: Cached in Zustand temporarily
- **TTL**: Managed by backend (10 min Redis, 12 hours DB)

## Error Handling

### ApiError Class

```typescript
import { ApiError } from '@/lib/apiClient';

try {
  await userService.getCurrentUser();
} catch (error) {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      // Unauthorized - redirect to login
      window.location.href = '/login';
    } else if (error.statusCode === 503) {
      // Service unavailable - use cache
      const cached = userService.getCachedCurrentUser();
      // ...
    }
  }
}
```

### Graceful Degradation

The system is designed to work offline using cached data:

1. API call fails → Try cache
2. Cache available → Use cached data + show warning
3. No cache → Show error message

## Performance Optimization

### Best Practices

1. **Use Selectors** - Prevent unnecessary re-renders
   ```typescript
   // Good
   const user = useUserStore(selectCurrentUser);

   // Bad (causes re-render on any state change)
   const { currentUser: user } = useUserStore();
   ```

2. **Cache Wisely** - Don't over-fetch
   ```typescript
   // User already in cache? Skip API call
   const { user } = useUser(userId, autoFetch: false);
   ```

3. **Debounce Searches** - Avoid excessive API calls
   ```typescript
   // useUserSearch automatically debounces (500ms default)
   const { search } = useUserSearch();
   ```

4. **Batch Operations** - Load multiple users efficiently
   ```typescript
   // Load conversation participants at once
   const participantIds = conversation.participants.map(p => p.userId);
   await Promise.all(participantIds.map(id => fetchUserById(id)));
   ```

## Testing

### Mock User Service

```typescript
import { jest } from '@jest/globals';

export const mockUserService = {
  getCurrentUser: jest.fn(),
  getUserById: jest.fn(),
  searchUsers: jest.fn(),
};
```

### Test Example

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { UserProfile } from './UserProfile';

jest.mock('@/features/users', () => ({
  useUser: () => ({
    user: {
      id: '1',
      tmsUserId: 'tms-1',
      displayName: 'John Doe',
      email: 'john@example.com',
    },
    isLoading: false,
    error: null,
  }),
}));

test('renders user profile', async () => {
  render(<UserProfile userId="1" />);

  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });
});
```

## Troubleshooting

### "User not found" Error

**Cause**: User doesn't exist in TMS or hasn't been synced yet

**Solution**:
1. Check if user exists in TMS
2. Trigger manual sync (admin):
   ```typescript
   await userService.syncUsers(['tms-user-id'], true);
   ```

### Stale User Data

**Cause**: User was updated in TMS but not synced

**Solution**:
- Wait for automatic sync (happens every 10 min)
- OR manually invalidate cache (admin):
   ```typescript
   await userService.invalidateUserCache('tms-user-id');
   ```

### Search Not Working

**Cause**: Query too short or filters too restrictive

**Solution**:
- Ensure query is at least 1 character
- Relax filters
- Check network tab for API errors

## Next Steps

### Recommended Enhancements

1. **User Profile Page** - Full profile view with all TMS data
2. **Organization Chart** - Visual hierarchy display
3. **User Directory** - Browsable user list with filters
4. **Admin Dashboard** - Sync management and analytics
5. **Offline Mode** - Full offline support with service worker

---

**Documentation Generated**: 2025-10-13
**Frontend Implementation**: ✅ Complete
**Ready for Production**: ✅ Yes
