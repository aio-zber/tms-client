/**
 * Media History Tab
 * Shows shared media: Media (images/videos), Files, Links
 *
 * Messenger pattern: paginated infinite scroll — loads next batch of messages
 * when the user scrolls near the bottom of each tab. Each tab independently
 * triggers fetchNextPage until all pages are loaded.
 *
 * All OSS media is loaded through the backend /files/proxy endpoint to bypass
 * Alibaba OSS CORS restrictions — same pattern as MessageBubble E2EE file decryption.
 */

'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  Film,
  Play,
  ExternalLink,
  Loader2,
  Globe,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { ImageLightbox, type LightboxImage } from '@/features/messaging/components/ImageLightbox';
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

/** Fires once when the element enters the scroll container (one-shot). */
function useInView(scrollRoot: HTMLDivElement | null) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { root: scrollRoot, rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return { ref, isInView };
}

/**
 * Scroll sentinel — triggers a callback when the element enters the viewport.
 * Used at the bottom of each tab to trigger fetchNextPage (Messenger pattern).
 * Resets when `resetKey` changes so re-mounting triggers a fresh observation.
 */
function ScrollSentinel({
  onVisible,
  scrollRoot,
}: {
  onVisible: () => void;
  scrollRoot: Element | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisibleRef.current();
      },
      { root: scrollRoot, rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return <div ref={ref} className="h-1 w-full" />;
}

export function MediaHistoryTab({ conversationId }: MediaHistoryTabProps) {
  const [category, setCategory] = useState<MediaCategory>('media');
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const [previewsLoading, setPreviewsLoading] = useState(false);

  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Track decrypted blob URLs per message ID — populated by DecryptedMediaItem components
  const [decryptedMediaUrls, setDecryptedMediaUrls] = useState<Record<string, string>>({});

  // Refs to the scrollable container elements for each tab
  const mediaScrollRef = useRef<HTMLDivElement>(null);
  const filesScrollRef = useRef<HTMLDivElement>(null);
  const linksScrollRef = useRef<HTMLDivElement>(null);

  // Use the same TanStack Query cache as Chat.tsx.
  // fetchNextPage loads older pages of messages progressively (Messenger pattern).
  const { messages, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useMessagesQuery({ conversationId });

  // Trigger next page fetch when sentinel is visible
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mediaMessages = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            !m.deletedAt &&
            (m.type === 'IMAGE' ||
              (m.type === 'FILE' &&
                (isVideoMime(effectiveMimeType(m.metadata)) ||
                  isImageMime(effectiveMimeType(m.metadata)))))
        )
        .slice()
        .reverse(),
    [messages]
  );

  const fileMessages = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            !m.deletedAt &&
            m.type === 'FILE' &&
            !isVideoMime(effectiveMimeType(m.metadata)) &&
            !isImageMime(effectiveMimeType(m.metadata))
        )
        .slice()
        .reverse(),
    [messages]
  );

  const linkItems = useMemo(
    () =>
      messages
        .slice()
        .reverse()
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
        .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx),
    [messages]
  );

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

  // Unified lightbox list — images AND videos in order, latest first.
  const lightboxImageList = useMemo(() => {
    return mediaMessages
      .map((m) => {
        const mime = effectiveMimeType(m.metadata);
        const video = isVideoMime(mime);
        const encMeta = m.metadata?.encryption as { fileKey?: string; fileNonce?: string; originalMimeType?: string } | undefined;
        const proxyUrl = m.metadata?.fileUrl ? makeProxyUrl(m.metadata.fileUrl) : '';
        const blobUrl = !video ? decryptedMediaUrls[m.id] : undefined;
        return {
          id: m.id,
          url: blobUrl || proxyUrl,
          fileName: m.metadata?.fileName,
          isVideo: video,
          mimeType: mime,
          encMeta: (!blobUrl && encMeta?.fileKey && encMeta?.fileNonce)
            ? { fileKey: encMeta.fileKey, fileNonce: encMeta.fileNonce, originalMimeType: encMeta.originalMimeType }
            : undefined,
        };
      })
      .filter((item) => item.url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaMessages, decryptedMediaUrls]);

  const openLightbox = (clickedMsg: Message) => {
    const images = lightboxImageList.map(({ url, fileName, isVideo, mimeType, encMeta }) => ({ url, fileName, isVideo, mimeType, encMeta }));
    const idx = lightboxImageList.findIndex((item) => item.id === clickedMsg.id);
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
      <div className="flex flex-col">
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

        {/* Media grid — 3 rows visible (~288px), scroll for more */}
        {category === 'media' && (
          <div
            ref={mediaScrollRef}
            className="h-72 overflow-y-auto"
          >
            {mediaMessages.length === 0 && !hasNextPage ? (
              <EmptyState icon={<ImageIcon className="w-8 h-8" />} text="No media shared yet" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 p-1">
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
                          onPlay={() => openLightbox(msg)}
                        />
                      );
                    }

                    return (
                      <DecryptedMediaItem
                        key={msg.id}
                        messageId={msg.id}
                        ossFileUrl={ossFileUrl}
                        ossThumbUrl={ossThumbUrl}
                        fileName={msg.metadata?.fileName}
                        encMeta={encMeta}
                        scrollRoot={mediaScrollRef.current}
                        onDecrypted={(msgId, blobUrl) =>
                          setDecryptedMediaUrls((prev) => ({ ...prev, [msgId]: blobUrl }))
                        }
                        onClick={() => openLightbox(msg)}
                      />
                    );
                  })}
                </div>
                {hasNextPage && (
                  <div className="flex items-center justify-center py-4">
                    {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    <ScrollSentinel onVisible={handleLoadMore} scrollRoot={mediaScrollRef.current} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Files list */}
        {category === 'files' && (
          <div
            ref={filesScrollRef}
            className="h-72 overflow-y-auto"
          >
            {fileMessages.length === 0 && !hasNextPage ? (
              <EmptyState icon={<FileText className="w-8 h-8" />} text="No files shared yet" />
            ) : (
              <>
                <div className="space-y-0.5 p-1">
                  {fileMessages.map((msg) => {
                    const encMeta = msg.metadata?.encryption as { fileKey?: string; fileNonce?: string; originalMimeType?: string } | undefined;
                    const canDownload = !!msg.metadata?.fileUrl;
                    return (
                      <button
                        key={msg.id}
                        className="flex items-center gap-3 w-full py-3 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors text-left"
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
                        <div className="flex-shrink-0 w-10 h-10 bg-viber-purple/10 rounded-xl flex items-center justify-center">
                          <FileText className="w-5 h-5 text-viber-purple" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                            {msg.metadata?.fileName || 'File'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatBytes(msg.metadata?.fileSize) || 'Unknown size'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {hasNextPage && (
                  <div className="flex items-center justify-center py-4">
                    {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    <ScrollSentinel onVisible={handleLoadMore} scrollRoot={filesScrollRef.current} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Links list */}
        {category === 'links' && (
          <div
            ref={linksScrollRef}
            className="h-72 overflow-y-auto"
          >
            {linkItems.length === 0 && !hasNextPage ? (
              <EmptyState icon={<LinkIcon className="w-8 h-8" />} text="No links shared yet" />
            ) : previewsLoading && Object.keys(previews).length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="space-y-2 p-1">
                  {linkItems.map((item, idx) => (
                    <LinkPreviewCard key={idx} url={item.url} preview={previews[item.url]} />
                  ))}
                </div>
                {hasNextPage && (
                  <div className="flex items-center justify-center py-4">
                    {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    <ScrollSentinel onVisible={handleLoadMore} scrollRoot={linksScrollRef.current} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Image Lightbox — portals internally to document.body to escape dialog stacking */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
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
  scrollRoot,
  onDecrypted,
  onClick,
}: {
  messageId: string;
  ossFileUrl: string;
  ossThumbUrl: string;
  fileName?: string;
  encMeta?: EncMeta;
  scrollRoot: HTMLDivElement | null;
  onDecrypted: (msgId: string, blobUrl: string) => void;
  onClick: () => void;
}) {
  const { ref, isInView } = useInView(scrollRoot);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    if (!isInView) return;

    const rawUrl = ossFileUrl || ossThumbUrl;
    if (!rawUrl) return;

    let objectUrl: string | null = null;

    if (encMeta?.fileKey && encMeta?.fileNonce) {
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
 * Video thumbnail cell for the media history grid.
 * E2EE video decryption is deferred to the lightbox VideoPlayer — too heavy for grid.
 */
function DecryptedVideoCell({
  ossThumbUrl,
  fileName,
  onPlay,
}: {
  ossFileUrl: string;
  ossThumbUrl: string;
  mimeType?: string;
  fileName?: string;
  encMeta?: EncMeta;
  onPlay: () => void;
}) {
  return (
    <button
      onClick={onPlay}
      className="relative aspect-square bg-gray-900 rounded overflow-hidden group"
      title={fileName}
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
        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
        </div>
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
