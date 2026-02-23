/**
 * Media History Tab
 * Shows shared media: Media (images/videos), Files, Links
 *
 * Reads directly from the TanStack Query cache populated by useMessagesQuery —
 * no duplicate network requests. If the user opens the dialog before messages
 * are loaded the hook fetches them, otherwise data is instant from cache.
 *
 * All OSS media is loaded through the backend /files/proxy endpoint to bypass
 * Alibaba OSS CORS restrictions — same pattern as MessageBubble E2EE file decryption.
 */

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
import { apiClient } from '@/lib/apiClient';
import { ImageLightbox } from '@/features/messaging/components/ImageLightbox';
import { VideoLightbox } from '@/features/messaging/components/VideoLightbox';
import { decryptedContentCache } from '@/features/messaging/hooks/useMessages';
import { useMessagesQuery } from '@/features/messaging/hooks/useMessagesQuery';
import { getApiBaseUrl, STORAGE_KEYS } from '@/lib/constants';
import { log } from '@/lib/logger';
import type { Message, MessageMetadata } from '@/types/message';

/** Read the auth token from localStorage (safe to call synchronously client-side) */
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

/**
 * Build backend proxy URL for an OSS asset.
 * Includes ?token= so <img src> and <video src> can authenticate
 * (browsers can't send Authorization headers for media elements).
 * getApiBaseUrl() is synchronous — safe to call at render time.
 */
function makeProxyUrl(ossUrl: string): string {
  const token = getAuthToken();
  const params = new URLSearchParams({ url: ossUrl });
  if (token) params.set('token', token);
  return `${getApiBaseUrl()}/files/proxy?${params.toString()}`;
}

/**
 * Download a file, decrypting it first if E2EE metadata is present.
 * Messenger pattern: fetch encrypted bytes, decrypt in-browser, save plaintext.
 */
async function downloadViaProxy(
  ossUrl: string,
  fileName: string,
  encMeta?: { fileKey?: string; fileNonce?: string; originalMimeType?: string }
) {
  try {
    const proxyUrl = makeProxyUrl(ossUrl);
    const res = await fetch(proxyUrl);
    const arrayBuffer = await res.arrayBuffer();

    let blob: Blob;

    if (encMeta?.fileKey && encMeta?.fileNonce) {
      // E2EE file — decrypt before saving
      const { encryptionService } = await import('@/features/encryption');
      const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
      const mimeType = encMeta.originalMimeType || 'application/octet-stream';
      blob = await encryptionService.decryptFile(
        arrayBuffer,
        fromBase64(encMeta.fileKey),
        fromBase64(encMeta.fileNonce),
        mimeType
      );
    } else {
      blob = new Blob([arrayBuffer]);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    log.error('[MediaHistoryTab] Download failed:', err);
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

/** Returns true after the component has mounted on the client (safe for portals/document access). */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/** Fires once when the element enters the viewport (one-shot, never resets to false). */
function useInView(rootMargin = '200px') {
  const ref = useRef<HTMLButtonElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isInView };
}

export function MediaHistoryTab({ conversationId }: MediaHistoryTabProps) {
  const mounted = useMounted();
  const [category, setCategory] = useState<MediaCategory>('media');
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const [previewsLoading, setPreviewsLoading] = useState(false);

  const [lightboxImages, setLightboxImages] = useState<{ url: string; fileName?: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [videoLightbox, setVideoLightbox] = useState<{
    src: string;
    mimeType?: string;
    fileName?: string;
    thumbnailUrl?: string;
  } | null>(null);

  // Track decrypted blob URLs per message ID — populated by DecryptedMediaItem components
  const [decryptedMediaUrls, setDecryptedMediaUrls] = useState<Record<string, string>>({});

  // Read from the same TanStack Query cache that Chat.tsx uses.
  // When the dialog opens from an active chat, data is instant (zero extra requests).
  // If messages haven't been fetched yet, the hook fetches them with proper E2EE decryption.
  const { messages, isLoading, error } = useMessagesQuery({ conversationId });

  const mediaMessages = messages.filter(
    (m) =>
      !m.deletedAt &&
      (m.type === 'IMAGE' ||
        (m.type === 'FILE' &&
          (isVideoMime(effectiveMimeType(m.metadata)) ||
            isImageMime(effectiveMimeType(m.metadata)))))
  );

  const fileMessages = messages.filter(
    (m) =>
      !m.deletedAt &&
      m.type === 'FILE' &&
      !isVideoMime(effectiveMimeType(m.metadata)) &&
      !isImageMime(effectiveMimeType(m.metadata))
  );

  const linkItems = messages
    .filter((m) => !m.deletedAt && m.type === 'TEXT')
    .flatMap((m) => {
      // useMessagesQuery already decrypts content; also check in-memory cache as fallback
      const plaintext =
        m.content ||
        decryptedContentCache.get(m.id) ||
        (m.encrypted ? null : m.content);
      if (!plaintext || plaintext.startsWith('[')) return [];
      return extractUrls(plaintext).map((url) => ({ url, message: m }));
    })
    .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx);

  // Stable key for link URLs — avoids render loop from new array reference each render
  const linkUrlsKey = linkItems.map((i) => i.url).join(',');

  // Load link previews when Links tab is active
  useEffect(() => {
    if (category !== 'links' || !linkUrlsKey) return;
    const urls = linkUrlsKey.split(',');
    const unfetched = urls.filter((u) => !(u in previews));
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
  }, [category, linkUrlsKey]);

  const tabs: { key: MediaCategory; label: string; count: number }[] = [
    { key: 'media', label: 'Media', count: mediaMessages.length },
    { key: 'files', label: 'Files', count: fileMessages.length },
    { key: 'links', label: 'Links', count: linkItems.length },
  ];

  // Pre-build lightbox image list — prefer decrypted blob URLs for E2EE images
  const lightboxImageList = useMemo(() => {
    return mediaMessages
      .filter((m) => !isVideoMime(effectiveMimeType(m.metadata)))
      .map((m) => ({
        id: m.id,
        // Use decrypted blob URL if available (E2EE), fall back to proxy URL
        url: decryptedMediaUrls[m.id] || (m.metadata?.fileUrl ? makeProxyUrl(m.metadata.fileUrl) : ''),
        fileName: m.metadata?.fileName,
      }))
      .filter((img) => img.url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaMessages, decryptedMediaUrls]);

  const openLightbox = (clickedMsg: Message) => {
    const images = lightboxImageList.map(({ url, fileName }) => ({ url, fileName }));
    const idx = lightboxImageList.findIndex((img) => img.id === clickedMsg.id);

    setLightboxImages(images);
    setLightboxIndex(Math.max(0, idx));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-viber-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        Failed to load media history
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
                  const encMeta = msg.metadata?.encryption as { fileKey?: string; fileNonce?: string; originalMimeType?: string } | undefined;
                  const ossFileUrl = msg.metadata?.fileUrl || '';
                  const ossThumbUrl = msg.metadata?.thumbnailUrl || '';

                  if (isVideo) {
                    return (
                      <DecryptedVideoCell
                        key={msg.id}
                        ossFileUrl={ossFileUrl}
                        ossThumbUrl={ossThumbUrl}
                        mimeType={mime}
                        fileName={msg.metadata?.fileName}
                        encMeta={encMeta}
                        onPlay={(src, thumbUrl) =>
                          setVideoLightbox({
                            src,
                            mimeType: mime,
                            fileName: msg.metadata?.fileName,
                            thumbnailUrl: thumbUrl,
                          })
                        }
                      />
                    );
                  }

                  // Image — use DecryptedMediaItem to handle E2EE decryption
                  return (
                    <DecryptedMediaItem
                      key={msg.id}
                      messageId={msg.id}
                      ossFileUrl={ossFileUrl}
                      ossThumbUrl={ossThumbUrl}
                      fileName={msg.metadata?.fileName}
                      encMeta={encMeta}
                      onDecrypted={(msgId, blobUrl) =>
                        setDecryptedMediaUrls((prev) => ({ ...prev, [msgId]: blobUrl }))
                      }
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
          <ScrollArea className="h-72 w-full overflow-hidden">
            {fileMessages.length === 0 ? (
              <EmptyState icon={<FileText className="w-8 h-8" />} text="No files shared yet" />
            ) : (
              <div className="space-y-1 w-full">
                {fileMessages.map((msg) => {
                  const encMeta = msg.metadata?.encryption as { fileKey?: string; fileNonce?: string; originalMimeType?: string } | undefined;
                  const canDownload = !!msg.metadata?.fileUrl;
                  return (
                    <button
                      key={msg.id}
                      className="w-full min-w-0 flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-border transition-colors text-left overflow-hidden"
                      disabled={!canDownload}
                      onClick={() => {
                        if (!canDownload) return;
                        downloadViaProxy(
                          msg.metadata!.fileUrl!,
                          msg.metadata?.fileName || 'file',
                          encMeta
                        );
                      }}
                    >
                      {/* File type icon */}
                      <div className="flex-shrink-0 w-10 h-10 bg-viber-purple/10 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-viber-purple" />
                      </div>

                      {/* Name + size — truncate to never push download button off screen */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate leading-snug">
                          {msg.metadata?.fileName || 'File'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatBytes(msg.metadata?.fileSize) || 'Unknown size'}
                        </p>
                      </div>

                      {/* Download button — Viber-style solid purple circle, always visible */}
                      {canDownload && (
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-viber-purple flex items-center justify-center shadow-sm">
                          <Download className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
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

      {/* Image Lightbox — portal to document.body to escape dialog stacking context */}
      {mounted && lightboxImages.length > 0 &&
        createPortal(
          <ImageLightbox
            images={lightboxImages}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxImages([])}
          />,
          document.body
        )
      }

      {/* Video Lightbox — portal to document.body to cover full viewport */}
      {mounted && videoLightbox &&
        createPortal(
          <VideoLightbox
            src={videoLightbox.src}
            mimeType={videoLightbox.mimeType}
            fileName={videoLightbox.fileName}
            thumbnailUrl={videoLightbox.thumbnailUrl}
            onClose={() => setVideoLightbox(null)}
          />,
          document.body
        )
      }
    </>
  );
}

interface EncMeta {
  fileKey?: string;
  fileNonce?: string;
  originalMimeType?: string;
}

/**
 * E2EE-aware image grid cell.
 * If encMeta is present, fetches + decrypts the file and shows the blob URL.
 * Notifies parent via onDecrypted so the lightbox can use the same blob URL.
 */
function DecryptedMediaItem({
  messageId,
  ossFileUrl,
  ossThumbUrl,
  fileName,
  encMeta,
  onDecrypted,
  onClick,
}: {
  messageId: string;
  ossFileUrl: string;
  ossThumbUrl: string;
  fileName?: string;
  encMeta?: EncMeta;
  onDecrypted: (msgId: string, blobUrl: string) => void;
  onClick: () => void;
}) {
  const { ref, isInView } = useInView('200px');
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    if (!isInView) return;  // Only load when in (or near) the viewport

    const rawUrl = ossFileUrl || ossThumbUrl;
    if (!rawUrl) return;

    let objectUrl: string | null = null;

    if (encMeta?.fileKey && encMeta?.fileNonce) {
      // E2EE: fetch encrypted bytes through proxy, decrypt in-browser
      setDecrypting(true);
      const proxyUrl = makeProxyUrl(rawUrl);
      (async () => {
        try {
          const res = await fetch(proxyUrl);
          const arrayBuffer = await res.arrayBuffer();
          const { encryptionService } = await import('@/features/encryption');
          const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
          const mimeType = encMeta.originalMimeType || 'image/jpeg';
          const blob = await encryptionService.decryptFile(
            arrayBuffer,
            fromBase64(encMeta.fileKey!),
            fromBase64(encMeta.fileNonce!),
            mimeType
          );
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
          onDecrypted(messageId, objectUrl);
        } catch (err) {
          log.error('[MediaHistoryTab] Image decryption failed:', err);
          setFailed(true);
        } finally {
          setDecrypting(false);
        }
      })();
    } else {
      // Non-E2EE: use proxy URL directly
      setSrc(makeProxyUrl(rawUrl));
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, ossFileUrl, ossThumbUrl, encMeta?.fileKey, isInView]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="relative aspect-square bg-gray-100 dark:bg-dark-surface rounded overflow-hidden group"
      title={fileName}
    >
      {decrypting ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-viber-purple" />
        </div>
      ) : src && !failed ? (
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

/**
 * E2EE-aware video thumbnail cell.
 * Thumbnail is non-E2EE (uploaded as plain thumbnail), file is E2EE.
 * On play, decrypts the video and opens the lightbox with the blob URL.
 */
function DecryptedVideoCell({
  ossFileUrl,
  ossThumbUrl,
  mimeType,
  fileName,
  encMeta,
  onPlay,
}: {
  ossFileUrl: string;
  ossThumbUrl: string;
  mimeType?: string;
  fileName?: string;
  encMeta?: EncMeta;
  onPlay: (src: string, thumbnailUrl?: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!ossFileUrl) return;

    if (encMeta?.fileKey && encMeta?.fileNonce) {
      setLoading(true);
      try {
        const proxyUrl = makeProxyUrl(ossFileUrl);
        const res = await fetch(proxyUrl);
        const arrayBuffer = await res.arrayBuffer();
        const { encryptionService } = await import('@/features/encryption');
        const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
        const mime = encMeta.originalMimeType || mimeType || 'video/mp4';
        const blob = await encryptionService.decryptFile(
          arrayBuffer,
          fromBase64(encMeta.fileKey!),
          fromBase64(encMeta.fileNonce!),
          mime
        );
        const objectUrl = URL.createObjectURL(blob);
        const thumbUrl = ossThumbUrl ? makeProxyUrl(ossThumbUrl) : undefined;
        onPlay(objectUrl, thumbUrl);
      } catch (err) {
        log.error('[MediaHistoryTab] Video decryption failed:', err);
      } finally {
        setLoading(false);
      }
    } else {
      onPlay(makeProxyUrl(ossFileUrl), ossThumbUrl ? makeProxyUrl(ossThumbUrl) : undefined);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative aspect-square bg-gray-900 rounded overflow-hidden group"
      title={fileName}
      disabled={loading}
    >
      {ossThumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={makeProxyUrl(ossThumbUrl)}
          alt={fileName || 'Video'}
          className="w-full h-full object-cover opacity-80"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Film className="w-8 h-8 text-gray-500" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        {loading ? (
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        )}
      </div>
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
