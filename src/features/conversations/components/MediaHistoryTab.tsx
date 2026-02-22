/**
 * Media History Tab
 * Shows shared media in three categories: Media (images/videos), Files, Links
 *
 * Links tab: Messenger-style OG preview cards (title, description, image, domain)
 * fetched server-side and cached in Redis for 24 h.
 *
 * Images: open in full-screen ImageLightbox (not downloaded)
 * Videos: inline <video> player
 * Encrypted messages: plaintext looked up from decryptedContentCache
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  Film,
  Play,
  ExternalLink,
  Loader2,
  Globe,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { messageService } from '@/features/messaging/services/messageService';
import { apiClient } from '@/lib/apiClient';
import { ImageLightbox } from '@/features/messaging/components/ImageLightbox';
import { VideoLightbox } from '@/features/messaging/components/VideoLightbox';
import { decryptedContentCache } from '@/features/messaging/hooks/useMessages';
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

/** Resolve effective MIME type — encrypted messages store originalMimeType in metadata.encryption */
function effectiveMimeType(metadata?: MessageMetadata): string | undefined {
  return metadata?.mimeType || (metadata?.encryption as Record<string, unknown> | undefined)?.originalMimeType as string | undefined;
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

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<{ url: string; fileName?: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // Video lightbox state
  const [videoLightbox, setVideoLightbox] = useState<{ src: string; mimeType?: string; fileName?: string; thumbnailUrl?: string } | null>(null);

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
    (m) =>
      m.type === 'IMAGE' ||
      (m.type === 'FILE' && (isVideoMime(effectiveMimeType(m.metadata)) || isImageMime(effectiveMimeType(m.metadata))))
  );

  const fileMessages = messages.filter(
    (m) =>
      m.type === 'FILE' &&
      !isVideoMime(effectiveMimeType(m.metadata)) &&
      !isImageMime(effectiveMimeType(m.metadata))
  );

  // For links: use decryptedContentCache for encrypted messages
  const linkItems = messages
    .filter((m) => m.type === 'TEXT')
    .flatMap((m) => {
      const plaintext =
        decryptedContentCache.get(m.id) ??
        (m.encrypted ? null : m.content);
      if (!plaintext) return [];
      return extractUrls(plaintext).map((url) => ({ url, message: m }));
    })
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

  // Build lightbox image list from media messages
  const openLightbox = (clickedMsg: Message) => {
    const images = mediaMessages
      .filter((m) => !isVideoMime(effectiveMimeType(m.metadata)))
      .map((m) => ({
        url: m.metadata?.fileUrl || '',
        fileName: m.metadata?.fileName,
      }))
      .filter((img) => img.url);

    const idx = mediaMessages
      .filter((m) => !isVideoMime(effectiveMimeType(m.metadata)))
      .findIndex((m) => m.id === clickedMsg.id);

    setLightboxImages(images);
    setLightboxIndex(Math.max(0, idx));
  };

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
    <>
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
                  const mime = effectiveMimeType(msg.metadata);
                  const isVideo = isVideoMime(mime);
                  const src = msg.metadata?.thumbnailUrl || msg.metadata?.fileUrl || '';
                  const fileUrl = msg.metadata?.fileUrl || '';

                  if (isVideo) {
                    // Show thumbnail/play-icon preview — click opens VideoLightbox (same as chat)
                    const thumbSrc = msg.metadata?.thumbnailUrl || '';
                    return (
                      <button
                        key={msg.id}
                        onClick={() => setVideoLightbox({
                          src: fileUrl,
                          mimeType: mime,
                          fileName: msg.metadata?.fileName,
                          thumbnailUrl: msg.metadata?.thumbnailUrl,
                        })}
                        className="relative aspect-square bg-gray-900 rounded overflow-hidden group"
                        title={msg.metadata?.fileName}
                      >
                        {thumbSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbSrc}
                            alt={msg.metadata?.fileName || 'Video'}
                            className="w-full h-full object-cover opacity-80"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-gray-500" />
                          </div>
                        )}
                        {/* Play icon overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      </button>
                    );
                  }

                  // Image — open lightbox on click
                  return (
                    <MediaImageCell
                      key={msg.id}
                      src={src}
                      fileName={msg.metadata?.fileName}
                      onClick={() => openLightbox(msg)}
                    />
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
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
                  >
                    <div className="flex-shrink-0 w-9 h-9 bg-viber-purple/10 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-viber-purple" />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium truncate">
                        {msg.metadata?.fileName || 'File'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {formatBytes(msg.metadata?.fileSize)}
                      </p>
                    </div>
                    {msg.metadata?.fileUrl && (
                      <button
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border text-gray-400 hover:text-viber-purple transition-colors"
                        title="Download"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const { getApiBaseUrl } = await import('@/lib/constants');
                            const token = localStorage.getItem('auth_token');
                            const proxyUrl = `${getApiBaseUrl()}/files/proxy?url=${encodeURIComponent(msg.metadata!.fileUrl!)}`;
                            const res = await fetch(proxyUrl, {
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = msg.metadata?.fileName || 'file';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch {
                            // Fallback: open directly
                            window.open(msg.metadata?.fileUrl, '_blank');
                          }
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
              <div className="space-y-2">
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

      {/* Image Lightbox */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}

      {/* Video Lightbox */}
      {videoLightbox && (
        <VideoLightbox
          src={videoLightbox.src}
          mimeType={videoLightbox.mimeType}
          fileName={videoLightbox.fileName}
          thumbnailUrl={videoLightbox.thumbnailUrl}
          onClose={() => setVideoLightbox(null)}
        />
      )}
    </>
  );
}

/** Image cell with error fallback — needs its own state so hooks work correctly */
function MediaImageCell({ src, fileName, onClick }: { src: string; fileName?: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      onClick={onClick}
      className="relative aspect-square bg-gray-100 dark:bg-dark-surface rounded overflow-hidden group"
      title={fileName}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={fileName || 'Image'}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-300" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </button>
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
