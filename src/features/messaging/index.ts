/**
 * Messaging Feature
 * Export all messaging-related functionality
 */

// Services
export { messageService } from './services/messageService';
export * from './services/messageService';

// Hooks
export * from './hooks';

// Components
export { default as MessageSearchDialog } from './components/MessageSearchDialog';
export { default as ChatSearchBar } from './components/ChatSearchBar';
export { MessageBubble } from './components/MessageBubble';
export { MessageInput } from './components/MessageInput';
export { MessageList } from './components/MessageList';
