/**
 * Chat Window Page
 * Displays the conversation messages and chat interface
 * Refactored to use the unified Chat component
 */

'use client';

import { use } from 'react';
import { Chat } from '@/features/chat/components/Chat';

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = use(params);

  return <Chat conversationId={conversationId} />;
}
