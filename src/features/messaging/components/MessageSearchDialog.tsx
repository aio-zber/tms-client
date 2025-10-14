/**
 * Message Search Dialog
 * Search messages within conversations
 */

'use client';

import { useState, useEffect } from 'react';
import { Search, X, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSearchMessages } from '../hooks/useSearchMessages';
import { format } from 'date-fns';

interface MessageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  onMessageClick?: (messageId: string) => void;
}

export default function MessageSearchDialog({
  open,
  onOpenChange,
  conversationId,
  onMessageClick,
}: MessageSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { results, searching, search, clear } = useSearchMessages();

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      clear();
    }
  }, [open, clear]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery.trim()) {
        search(searchQuery, {
          conversation_id: conversationId,
          limit: 50,
        });
      } else {
        clear();
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, conversationId, search, clear]);

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'MMM d, yyyy HH:mm');
    } catch {
      return '';
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 text-gray-900">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Search Messages</DialogTitle>
          <DialogDescription>
            {conversationId
              ? 'Search messages in this conversation'
              : 'Search messages across all conversations'}
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search for messages..."
            className="pl-9 pr-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="h-96">
          {searching ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-viber-purple mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Searching messages...</p>
              </div>
            </div>
          ) : results.length === 0 && searchQuery ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No messages found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Try different keywords
                </p>
              </div>
            </div>
          ) : !searchQuery ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <Search className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  Start typing to search messages
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {results.map((message) => (
                <button
                  key={message.id}
                  onClick={() => {
                    onMessageClick?.(message.id);
                    onOpenChange(false);
                  }}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      <AvatarImage src={undefined} />
                      <AvatarFallback className="bg-viber-purple text-white text-xs">
                        {getInitials('User')}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-medium text-sm text-gray-900">
                          {message.senderId}
                        </span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 break-words">
                        {highlightText(message.content, searchQuery)}
                      </p>

                      {message.isEdited && (
                        <span className="text-xs text-gray-400 italic mt-1">
                          (edited)
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Results Count */}
        {results.length > 0 && searchQuery && (
          <div className="text-sm text-gray-500 text-center pt-2 border-t">
            Found {results.length} message{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
