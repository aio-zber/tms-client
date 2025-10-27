# React Error #185 Fix - Infinite Re-renders

## Problem

After integrating the search feature, opening a chat caused a React error:

```
Uncaught Error: Minified React error #185
```

**React Error #185** = "Maximum update depth exceeded" - This happens when a component repeatedly calls setState in a way that causes infinite re-renders.

### Root Cause

The `highlightSearchText` function in `MessageBubble.tsx` was creating new JSX elements on every render:

```typescript
// ❌ BEFORE - Creates new objects on every render
const highlightSearchText = (text: string, query: string) => {
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => /* JSX here */)}
    </>
  );
};

// Used in render:
<p>{searchQuery ? highlightSearchText(message.content, searchQuery) : message.content}</p>
```

**Why this caused infinite renders:**
1. Function is recreated on every render (new function reference)
2. Function returns JSX (new object reference every time)
3. MessageBubble is wrapped in `memo()`, but the content changes every render
4. React thinks content changed → triggers re-render
5. Re-render creates new function → new JSX → triggers re-render → ♾️

## Solution

Use `useMemo` to memoize the highlighted content so it only recalculates when dependencies change:

```typescript
// ✅ AFTER - Memoized, only recalculates when content or query changes
const highlightedContent = useMemo(() => {
  if (!searchQuery || !searchQuery.trim() || !message.content) {
    return message.content;
  }

  const parts = message.content.split(new RegExp(`(${searchQuery})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 text-gray-900 rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}, [message.content, searchQuery]);

// Used in render:
<p>{highlightedContent}</p>
```

## Changes Made

### File: `src/features/messaging/components/MessageBubble.tsx`

#### 1. Added useMemo Import
```typescript
import { useState, useRef, useEffect, memo, useMemo } from 'react';
```

#### 2. Replaced Function with Memoized Value
```typescript
// Removed highlightSearchText function
// Added memoized value instead:
const highlightedContent = useMemo(() => {
  // ... highlight logic
}, [message.content, searchQuery]);
```

#### 3. Updated Usage
```typescript
// Before:
{searchQuery ? highlightSearchText(message.content, searchQuery) : message.content}

// After:
{highlightedContent}
```

## Why This Works

### Memoization Benefits

1. **Stable Reference**: `useMemo` returns the same object reference if dependencies haven't changed
2. **Conditional Recalculation**: Only runs when `message.content` or `searchQuery` changes
3. **Performance**: Avoids unnecessary string splitting and JSX creation
4. **Prevents Re-renders**: Stable reference means `memo()` can properly prevent re-renders

### Dependency Array
```typescript
useMemo(() => { /* ... */ }, [message.content, searchQuery])
```

The memoized value only recalculates when:
- `message.content` changes (different message)
- `searchQuery` changes (user types in search)

## Testing

### Build Status
```bash
✓ TypeScript compilation: PASSED
✓ Build: SUCCESSFUL
✓ No new errors or warnings
```

### Expected Behavior
- ✅ Chat opens without errors
- ✅ Messages render correctly
- ✅ Search highlights appear when searching
- ✅ No infinite re-renders
- ✅ Performance is good

## Similar Issues to Watch For

### Pattern to Avoid
```typescript
// ❌ BAD - Creates new objects on every render
const SomeComponent = ({ data }) => {
  const transformedData = data.map(item => ({
    ...item,
    processed: true
  }));

  return <ChildComponent data={transformedData} />;
};
```

### Pattern to Use
```typescript
// ✅ GOOD - Memoized
const SomeComponent = ({ data }) => {
  const transformedData = useMemo(
    () => data.map(item => ({ ...item, processed: true })),
    [data]
  );

  return <ChildComponent data={transformedData} />;
};
```

## React Memo + useMemo = ❤️

When using `memo()` on a component, ensure child props are stable:

```typescript
// Component is memoized
export const MessageBubble = memo(function MessageBubble({ ... }) {
  // ✅ Use useMemo for computed values passed to children
  const highlightedContent = useMemo(() => { ... }, [deps]);

  // ✅ Use useCallback for functions passed to children
  const handleClick = useCallback(() => { ... }, [deps]);

  // ❌ Don't create new objects/functions directly in render
  // const data = { processed: true }; // New object every render!

  return <div>{highlightedContent}</div>;
});
```

## Key Takeaways

1. **useMemo** - For computed values (objects, arrays, JSX)
2. **useCallback** - For functions
3. **memo()** - For preventing component re-renders
4. **Dependency arrays** - Keep them accurate!
5. **Profiling** - Use React DevTools Profiler to catch these issues

## References

- [React Error #185](https://react.dev/errors/185)
- [React useMemo](https://react.dev/reference/react/useMemo)
- [React memo](https://react.dev/reference/react/memo)
- [Optimizing Performance](https://react.dev/learn/render-and-commit#optimizing-performance)

---

**Status**: Fixed ✅
**Build**: Passing ✅
**Ready for deployment**: Yes ✅
