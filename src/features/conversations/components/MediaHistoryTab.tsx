/**
 * Media History Tab
 * Shows shared media in three categories: Media (images/videos), Files, Links
 * Messenger-browser pattern: fetch all messages, filter client-side, display in grid/list
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, FileText, Link as LinkIcon, Image as ImageIcon, Film, ExternalLink, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { messageService } from '@/features/messaging/services/messageService';
import type { Message } from '@/types/message';

interface MediaHistoryTabProps {
  conversationId: string;
}

type MediaCategory = 'media' | 'files' | 'links';

// URL regex — same approach as Messenger for detecting links in text messages
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(URL_REGEX), (m) => m[0]);
}

function isImageMime(mimeType?: string) {
  return mimeType?.startsWith('image/');
}

function isVideoMime(mimeType?: string) {
  return mimeType?.startsWith('video/');
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaHistoryTab({ conversationId }: MediaHistoryTabProps) {
  const [category, setCategory] = useState<MediaCategory>('media');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all messages up to 200 (Messenger pattern: client-side filter, no extra endpoint needed)
  const fetchAllMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const collected: Message[] = [];
      let cursor: string | undefined;

      // Paginate up to 200 messages (4 pages of 50) — sufficient for media history
      for (let i = 0; i < 4; i++) {
        const response = await messageService.getConversationMessages(conversationId, {
          limit: 50,
          cursor,
        });

        const filtered = (response.data || []).filter((m: Message) => !m.deletedAt);
        collected.push(...filtered);

        if (!response.pagination?.has_more || !response.pagination?.next_cursor) break;
        cursor = response.pagination.next_cursor;
      }

      setMessages(collected);
    } catch {
      setError('Failed to load media history');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchAllMedia();
  }, [fetchAllMedia]);

  // Derive items per category
  const mediaMessages = messages.filter(
    (m) => m.type === 'IMAGE' || (m.type === 'FILE' && isVideoMime(m.metadata?.mimeType))
  );

  const fileMessages = messages.filter(
    (m) =>
      m.type === 'FILE' &&
      !isVideoMime(m.metadata?.mimeType) &&
      !isImageMime(m.metadata?.mimeType)
  );

  const linkMessages = messages
    .filter((m) => m.type === 'TEXT')
    .flatMap((m) =>
      extractUrls(m.content).map((url) => ({ url, message: m }))
    )
    .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx); // deduplicate

  const tabs: { key: MediaCategory; label: string; count: number }[] = [
    { key: 'media', label: 'Media', count: mediaMessages.length },
    { key: 'files', label: 'Files', count: fileMessages.length },
    { key: 'links', label: 'Links', count: linkMessages.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-viber-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-category tabs */}
      <div className="flex border-b dark:border-dark-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              category === tab.key
                ? 'border-viber-purple text-viber-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-dark-text-primary'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-xs text-gray-400">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Media grid */}
      {category === 'media' && (
        <ScrollArea className="h-72">
          {mediaMessages.length === 0 ? (
            <EmptyState icon={<ImageIcon className="w-8 h-8" />} text="No media shared yet" />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {mediaMessages.map((msg) => {
                const isVideo = isVideoMime(msg.metadata?.mimeType);
                const src = msg.metadata?.thumbnailUrl || msg.metadata?.fileUrl || '';
                return (
                  <a
                    key={msg.id}
                    href={msg.metadata?.fileUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square bg-gray-100 dark:bg-dark-surface rounded overflow-hidden group"
                    title={msg.metadata?.fileName}
                  >
                    {isVideo ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-dark-border">
                        <Film className="w-8 h-8 text-gray-400" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={msg.metadata?.fileName || 'Image'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </a>
                );
              })}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Files list */}
      {category === 'files' && (
        <ScrollArea className="h-72">
          {fileMessages.length === 0 ? (
            <EmptyState icon={<FileText className="w-8 h-8" />} text="No files shared yet" />
          ) : (
            <div className="space-y-1">
              {fileMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
                >
                  <div className="flex-shrink-0 w-9 h-9 bg-viber-purple/10 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-viber-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {msg.metadata?.fileName || 'File'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(msg.metadata?.fileSize)}
                    </p>
                  </div>
                  {msg.metadata?.fileUrl && (
                    <a
                      href={msg.metadata.fileUrl}
                      download={msg.metadata.fileName}
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border text-gray-400 hover:text-viber-purple transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Links list */}
      {category === 'links' && (
        <ScrollArea className="h-72">
          {linkMessages.length === 0 ? (
            <EmptyState icon={<LinkIcon className="w-8 h-8" />} text="No links shared yet" />
          ) : (
            <div className="space-y-1">
              {linkMessages.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
                >
                  <div className="flex-shrink-0 w-9 h-9 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-blue-600 dark:text-blue-400 truncate">{item.url}</p>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border text-gray-400 hover:text-blue-500 transition-colors"
                    title="Open link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
