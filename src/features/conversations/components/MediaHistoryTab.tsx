/**
 * Media History Tab
 * Shows shared media: Media (images/videos), Files, Links
 *
 * All OSS media is loaded through the backend /files/proxy endpoint to bypass
 * Alibaba OSS CORS restrictions — same pattern as MessageBubble E2EE file decryption.
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
import { STORAGE_KEYS } from '@/lib/constants';
import type { Message, MessageMetadata } from '@/types/message';

/** Read the auth token from localStorage (safe to call synchronously) */
function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
}

interface MediaHistoryTabProps {
  conversationId: string;
}

type MediaCategory = 'media' | 'files' | 'links';

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

function effectiveMimeType(metadata?: MessageMetadata): string | undefined {
  return (
    metadata?.mimeType ||
    (metadata?.encryption as Record<string, unknown> | undefined)
      ?.originalMimeType as string | undefined
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normaliseMetadata(msg: Record<string, unknown>): Message {
  return {
    ...msg,
    metadata: (msg.metadata_json ?? msg.metadata) as MessageMetadata | undefined,
    conversationId: (msg.conversation_id ?? msg.conversationId) as string,
    senderId: (msg.sender_id ?? msg.senderId) as string,
    isEdited: (msg.is_edited ?? msg.isEdited ?? false) as boolean,
    sequenceNumber: (msg.sequence_number ?? msg.sequenceNumber ?? 0) as number,
    createdAt: (msg.created_at ?? msg.createdAt) as string,
    updatedAt: (msg.updated_at ?? msg.updatedAt) as string | undefined,
    deletedAt: (msg.deleted_at ?? msg.deletedAt) as string | undefined,
    replyToId: (msg.reply_to_id ?? msg.replyToId) as string | undefined,
  } as Message;
}

/**
 * Build backend proxy URL for an OSS asset.
 * Includes ?token= so <img src> and <video src> can authenticate
 * (browsers can't send Authorization headers for media elements).
 */
function makeProxyUrl(apiBase: string, ossUrl: string): string {
  const token = getAuthToken();
  const params = new URLSearchParams({ url: ossUrl });
  if (token) params.set('token', token);
  return `${apiBase}/files/proxy?${params.toString()}`;
}

async function downloadViaProxy(ossUrl: string, fileName: string) {
  try {
    const { getApiBaseUrl } = await import('@/lib/constants');
    const proxyUrl = makeProxyUrl(getApiBaseUrl(), ossUrl);
    // Token already embedded in URL via makeProxyUrl; fetch still sends it in query param
    const res = await fetch(proxyUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    window.open(ossUrl, '_blank');
  }
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
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const [previewsLoading, setPreviewsLoading] = useState(false);

  // Resolve the API base URL once — used to build proxy src URLs for <img>/<video>
  const [apiBase, setApiBase] = useState('');
  useEffect(() => {
    import('@/lib/constants').then(({ getApiBaseUrl }) => {
      setApiBase(getApiBaseUrl());
    });
  }, []);

  const [lightboxImages, setLightboxImages] = useState<{ url: string; fileName?: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [videoLightbox, setVideoLightbox] = useState<{
    src: string;
    mimeType?: string;
    fileName?: string;
    thumbnailUrl?: string;
  } | null>(null);

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
        const raw = (response.data || []) as unknown as Record<string, unknown>[];
        const filtered = raw.map(normaliseMetadata).filter((m) => !m.deletedAt);
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

  const mediaMessages = messages.filter(
    (m) =>
      m.type === 'IMAGE' ||
      (m.type === 'FILE' &&
        (isVideoMime(effectiveMimeType(m.metadata)) ||
          isImageMime(effectiveMimeType(m.metadata))))
  );

  const fileMessages = messages.filter(
    (m) =>
      m.type === 'FILE' &&
      !isVideoMime(effectiveMimeType(m.metadata)) &&
      !isImageMime(effectiveMimeType(m.metadata))
  );

  const linkItems = messages
    .filter((m) => m.type === 'TEXT')
    .flatMap((m) => {
      const plaintext =
        decryptedContentCache.get(m.id) ?? (m.encrypted ? null : m.content);
      if (!plaintext) return [];
      return extractUrls(plaintext).map((url) => ({ url, message: m }));
    })
    .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx);

  useEffect(() => {
    if (category !== 'links' || linkItems.length === 0) return;
    const unfetched = linkItems.map((i) => i.url).filter((u) => !(u in previews));
    if (unfetched.length === 0) return;

    setPreviewsLoading(true);
    Promise.allSettled(
      unfetched.map(async (url) => {
        try {
          const data = await apiClient.get<LinkPreview>(`/messages/link-preview`, { url });
          return { url, data };
        } catch {
          const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
          return { url, data: { url, domain } as LinkPreview };
        }
      })
    ).then((results) => {
      const map: Record<string, LinkPreview> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') map[r.value.url] = r.value.data;
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

  /** Build proxied URL for OSS assets — only once apiBase is resolved */
  const proxied = (ossUrl?: string): string => {
    if (!ossUrl || !apiBase) return '';
    return makeProxyUrl(apiBase, ossUrl);
  };

  const openLightbox = (clickedMsg: Message) => {
    const imageMessages = mediaMessages.filter(
      (m) => !isVideoMime(effectiveMimeType(m.metadata))
    );
    const images = imageMessages
      .map((m) => ({
        url: proxied(m.metadata?.fileUrl),
        fileName: m.metadata?.fileName,
      }))
      .filter((img) => img.url);

    const idx = imageMessages.findIndex((m) => m.id === clickedMsg.id);
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
      <div className="space-y-3">
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
              <div className="grid grid-cols-3 gap-1 pr-1">
                {mediaMessages.map((msg) => {
                  const mime = effectiveMimeType(msg.metadata);
                  const isVideo = isVideoMime(mime);
                  const ossFileUrl = msg.metadata?.fileUrl || '';
                  const ossThumbUrl = msg.metadata?.thumbnailUrl || '';

                  if (isVideo) {
                    return (
                      <button
                        key={msg.id}
                        onClick={() =>
                          setVideoLightbox({
                            // Pass proxied URLs to VideoLightbox
                            src: proxied(ossFileUrl),
                            mimeType: mime,
                            fileName: msg.metadata?.fileName,
                            thumbnailUrl: proxied(ossThumbUrl) || undefined,
                          })
                        }
                        className="relative aspect-square bg-gray-900 rounded overflow-hidden group"
                        title={msg.metadata?.fileName}
                      >
                        {ossThumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxied(ossThumbUrl)}
                            alt={msg.metadata?.fileName || 'Video'}
                            className="w-full h-full object-cover opacity-80"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-gray-500" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      </button>
                    );
                  }

                  // Image — proxied src, open lightbox on click
                  return (
                    <MediaImageCell
                      key={msg.id}
                      src={proxied(ossFileUrl) || proxied(ossThumbUrl)}
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
              <div className="space-y-1 pr-1">
                {fileMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors overflow-hidden"
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
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border text-gray-400 hover:text-viber-purple transition-colors"
                        title="Download"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadViaProxy(
                            msg.metadata!.fileUrl!,
                            msg.metadata?.fileName || 'file'
                          );
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

        {/* Links list */}
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
                {linkItems.map((item, idx) => (
                  <LinkPreviewCard key={idx} url={item.url} preview={previews[item.url]} />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      {/* Image Lightbox — URLs already proxied in openLightbox() */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}

      {/* Video Lightbox — URLs already proxied */}
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

/** Image grid cell — separate component so useState (error tracking) obeys hooks rules */
function MediaImageCell({
  src,
  fileName,
  onClick,
}: {
  src: string;
  fileName?: string;
  onClick: () => void;
}) {
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

function LinkPreviewCard({ url, preview }: { url: string; preview?: LinkPreview }) {
  const domain = preview?.domain ?? (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border transition-colors group min-w-0 overflow-hidden"
    >
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
      <div className="flex-1 min-w-0 overflow-hidden">
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
