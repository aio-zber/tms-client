/**
 * Media History Tab
 * Shows shared media in three categories: Media (images/videos), Files, Links
 *
 * Links tab: Messenger-style OG preview cards (title, description, image, domain)
 * fetched server-side and cached in Redis for 24 h.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  Film,
  ExternalLink,
  Loader2,
  Globe,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { messageService } from '@/features/messaging/services/messageService';
import { apiClient } from '@/lib/apiClient';
import type { Message, MessageMetadata } from '@/types/message';

interface MediaHistoryTabProps {
  conversationId: string;
}

type MediaCategory = 'media' | 'files' | 'links';

// URL regex for detecting links in text messages
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

/** Normalise raw API response: server returns metadata_json, Message type expects metadata */
function normaliseMetadata(msg: Record<string, unknown>): Message {
  const raw = msg as Record<string, unknown>;
  return {
    ...raw,
    metadata: (raw.metadata_json ?? raw.metadata) as MessageMetadata | undefined,
    conversationId: (raw.conversation_id ?? raw.conversationId) as string,
    senderId: (raw.sender_id ?? raw.senderId) as string,
    isEdited: (raw.is_edited ?? raw.isEdited ?? false) as boolean,
    sequenceNumber: (raw.sequence_number ?? raw.sequenceNumber ?? 0) as number,
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as string | undefined,
    deletedAt: (raw.deleted_at ?? raw.deletedAt) as string | undefined,
    replyToId: (raw.reply_to_id ?? raw.replyToId) as string | undefined,
  } as Message;
}

interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  domain: string;
}

export function MediaHistoryTab({ conversationId }: MediaHistoryTabProps) {
  const [category, setCategory] = useState<MediaCategory>('media');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // OG previews keyed by URL
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const [previewsLoading, setPreviewsLoading] = useState(false);

  // Fetch all messages up to 200 (4 pages of 50) — client-side filter
  const fetchAllMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const collected: Message[] = [];
      let cursor: string | undefined;

      for (let i = 0; i < 4; i++) {
        const response = await messageService.getConversationMessages(conversationId, {
          limit: 50,
          cursor,
        });

        // Normalise metadata_json → metadata for each message
        const raw = (response.data || []) as unknown as Record<string, unknown>[];
        const filtered = raw
          .map(normaliseMetadata)
          .filter((m) => !m.deletedAt);
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

  const linkItems = messages
    .filter((m) => m.type === 'TEXT' && m.content)
    .flatMap((m) =>
      extractUrls(m.content).map((url) => ({ url, message: m }))
    )
    .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx);

  // Fetch OG previews when the Links tab is opened
  useEffect(() => {
    if (category !== 'links' || linkItems.length === 0) return;

    const unfetched = linkItems.map((i) => i.url).filter((u) => !(u in previews));
    if (unfetched.length === 0) return;

    setPreviewsLoading(true);

    // Fetch all unfetched URLs in parallel (server caches in Redis so fast on repeat)
    Promise.allSettled(
      unfetched.map(async (url) => {
        try {
          const data = await apiClient.get<LinkPreview>(
            `/messages/link-preview`,
            { url }
          );
          return { url, data };
        } catch {
          // Fallback: just show domain
          const domain = new URL(url).hostname;
          return { url, data: { url, domain } as LinkPreview };
        }
      })
    ).then((results) => {
      const map: Record<string, LinkPreview> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map[r.value.url] = r.value.data;
        }
      }
      setPreviews((prev) => ({ ...prev, ...map }));
      setPreviewsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, linkItems.length]);

  const tabs: { key: MediaCategory; label: string; count: number }[] = [
    { key: 'media', label: 'Media', count: mediaMessages.length },
    { key: 'files', label: 'Files', count: fileMessages.length },
    { key: 'links', label: 'Links', count: linkItems.length },
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
                        onError={(e) => {
                          // Hide broken image — show icon fallback
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    {/* Fallback icon shown when image fails */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-[img[style*='none']]:opacity-100 pointer-events-none">
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    </div>
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
            <div className="space-y-1 pr-1">
              {fileMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors min-w-0"
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
                      onClick={(e) => e.stopPropagation()}
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

      {/* Links list — Messenger-style OG preview cards */}
      {category === 'links' && (
        <ScrollArea className="h-72">
          {linkItems.length === 0 ? (
            <EmptyState icon={<LinkIcon className="w-8 h-8" />} text="No links shared yet" />
          ) : previewsLoading && Object.keys(previews).length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2 pr-1">
              {linkItems.map((item, idx) => {
                const preview = previews[item.url];
                return (
                  <LinkPreviewCard key={idx} url={item.url} preview={preview} />
                );
              })}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}

/** Messenger-style link preview card */
function LinkPreviewCard({ url, preview }: { url: string; preview?: LinkPreview }) {
  const domain = preview?.domain ?? (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border transition-colors group min-w-0"
    >
      {/* Thumbnail / favicon */}
      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-surface flex items-center justify-center">
        {preview?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : preview?.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.favicon}
            alt=""
            className="w-6 h-6"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Globe className="w-6 h-6 text-gray-300" />
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        {preview?.title ? (
          <p className="text-sm font-medium text-gray-900 dark:text-dark-text line-clamp-2 leading-snug">
            {preview.title}
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary truncate">{url}</p>
        )}
        {preview?.description && (
          <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-0.5 line-clamp-2">
            {preview.description}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1">
          <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400 truncate">{domain}</span>
        </div>
      </div>

      <ExternalLink className="flex-shrink-0 w-4 h-4 text-gray-300 group-hover:text-gray-500 self-start mt-0.5 transition-colors" />
    </a>
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
