'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCw, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LightboxImage {
  /** Optional message ID — used by consumers (MediaHistoryTab, MessageList) for index lookup. Not used by the lightbox itself. */
  id?: string;
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  fileName?: string;
  /** If true, renders a video player instead of an image */
  isVideo?: boolean;
  mimeType?: string;
  /** E2EE metadata — if present and url is a proxy URL, lightbox decrypts on demand */
  encMeta?: { fileKey: string; fileNonce: string; originalMimeType?: string };
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen image lightbox viewer.
 * Supports zoom, pan, navigation, and download.
 * Follows Telegram/Messenger patterns.
 */
export function ImageLightbox({
  images,
  initialIndex = 0,
  onClose,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  // Video-specific state: play overlay shown until user clicks play.
  // isVideoDecrypting: E2EE decrypt in progress after play click.
  // videoPlaying: user clicked play — show the <video> element with src set.
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isVideoDecrypting, setIsVideoDecrypting] = useState(false);

  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Resolved URLs: starts as the passed-in urls, updated as E2EE images are decrypted
  const [resolvedUrls, setResolvedUrls] = useState<string[]>(() => images.map((img) => img.url));

  const currentImage = { ...images[currentIndex], url: resolvedUrls[currentIndex] };
  const hasMultiple = images.length > 1;

  // Mount guard — prevents SSR hydration mismatch (portal needs document)
  useEffect(() => {
    setMounted(true);
  }, []);

  // On-demand E2EE decryption for images: when navigating to an image that has encMeta
  // but no blob URL yet, decrypt it now. Videos use handleVideoPlayClick instead.
  useEffect(() => {
    const img = images[currentIndex];
    if (img.isVideo) return; // videos decrypt on play-click via handleVideoPlayClick
    if (!img.encMeta?.fileKey || !img.encMeta?.fileNonce) return;
    if (resolvedUrls[currentIndex]?.startsWith('blob:')) return; // already decrypted

    let objectUrl: string | null = null;
    (async () => {
      try {
        const { encryptionService } = await import('@/features/encryption');
        const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
        const res = await fetch(img.url);
        const arrayBuffer = await res.arrayBuffer();
        const mimeType = img.encMeta!.originalMimeType || 'image/jpeg';
        const blob = await encryptionService.decryptFile(
          arrayBuffer,
          fromBase64(img.encMeta!.fileKey),
          fromBase64(img.encMeta!.fileNonce),
          mimeType
        );
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrls((prev) => {
          const next = [...prev];
          next[currentIndex] = objectUrl!;
          return next;
        });
      } catch {
        // Leave broken URL — spinner will stop via onError
      }
    })();

    return () => {
      // Don't revoke immediately — user may navigate back; revoke on lightbox close
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Radix Dialog's hideOthers() marks all body children (including #lightbox-root)
  // as aria-hidden when the dialog opens. Remove it from our dedicated root so
  // pointer events and focus work inside the lightbox.
  useEffect(() => {
    if (!mounted) return;
    const root = document.getElementById('lightbox-root');
    if (!root) return;
    root.removeAttribute('aria-hidden');
    root.removeAttribute('data-aria-hidden');
  }, [mounted]);

  // Reset state when image/video changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setVideoPlaying(false);
    setIsVideoDecrypting(false);
  }, [currentIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.stopPropagation(); // prevent parent Radix Dialog from also closing
          onClose();
          break;
        case 'ArrowLeft':
          if (hasMultiple) goToPrevious();
          break;
        case 'ArrowRight':
          if (hasMultiple) goToNext();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          resetZoom();
          break;
        case 'r':
          handleRotate();
          break;
      }
    };

    // capture: true fires before Radix Dialog's document-level bubble listener
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hasMultiple, currentIndex, onClose]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Navigation
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 0.5);
      // Reset position if zooming out to 1 or less
      if (newZoom <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Rotate
  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Video play-click: decrypt E2EE video on demand, then start playback.
  // If already a blob URL (passed from bubble), just start playing immediately.
  const handleVideoPlayClick = useCallback(async () => {
    const img = images[currentIndex];
    const proxyUrl = img.url; // original proxy URL (before any resolvedUrls override)
    const currentUrl = resolvedUrls[currentIndex];

    // Already a blob (decrypted by bubble before opening lightbox) — play directly
    if (currentUrl.startsWith('blob:')) {
      setVideoPlaying(true);
      setIsLoading(false);
      return;
    }

    // E2EE video — decrypt on demand
    if (img.encMeta?.fileKey && img.encMeta?.fileNonce) {
      setIsVideoDecrypting(true);
      try {
        const { encryptionService } = await import('@/features/encryption');
        const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
        const res = await fetch(proxyUrl);
        const arrayBuffer = await res.arrayBuffer();
        const mimeType = img.encMeta.originalMimeType || img.mimeType || 'video/mp4';
        const blob = await encryptionService.decryptFile(
          arrayBuffer,
          fromBase64(img.encMeta.fileKey),
          fromBase64(img.encMeta.fileNonce),
          mimeType
        );
        const objectUrl = URL.createObjectURL(blob);
        setResolvedUrls((prev) => {
          const next = [...prev];
          next[currentIndex] = objectUrl;
          return next;
        });
      } catch {
        // Leave URL as-is — video will error naturally
      } finally {
        setIsVideoDecrypting(false);
      }
    }

    // Plain proxy URL (non-E2EE) or after decrypt completes
    setVideoPlaying(true);
    setIsLoading(true); // spinner until canPlay fires
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, images, resolvedUrls]);

  // Pan/drag when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    },
    [zoom, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && zoom > 1) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, zoom, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev + 0.25, 4));
    } else {
      setZoom((prev) => {
        const newZoom = Math.max(prev - 0.25, 0.5);
        if (newZoom <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return newZoom;
      });
    }
  }, []);

  // Download image — if already a blob (decrypted E2EE), download directly.
  // Otherwise route through backend proxy to avoid OSS CORS restrictions.
  const handleDownload = useCallback(async () => {
    try {
      const url = currentImage.url;
      const fileName = currentImage.fileName || `image-${Date.now()}.jpg`;
      if (url.startsWith('blob:')) {
        // Already decrypted — download the blob directly (plaintext bytes)
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const { getApiBaseUrl } = await import('@/lib/constants');
        const token = localStorage.getItem('auth_token');
        const proxyUrl = `${getApiBaseUrl()}/files/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, [currentImage]);

  // Handle click on backdrop to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === containerRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-auto"
      style={{ backgroundColor: '#1F242B' }}
      ref={containerRef}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2">
          {/* Image counter */}
          {hasMultiple && (
            <span className="text-white/90 text-sm font-medium px-3 py-1 bg-black/30 rounded-full">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls — images only */}
          {!currentImage.isVideo && (<>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Zoom out (-)"
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-white/90 text-sm w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-5 w-5" />
          </Button>

          {/* Rotate */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Rotate (R)"
          >
            <RotateCw className="h-5 w-5" />
          </Button>
          </>)}

          {/* Download */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 text-white hover:bg-white/20 z-10"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 text-white hover:bg-white/20 z-10"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* Media container */}
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden',
          'w-full h-full',
          !currentImage.isVideo && (zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in'),
          !currentImage.isVideo && isDragging && 'cursor-grabbing'
        )}
        onMouseDown={!currentImage.isVideo ? handleMouseDown : undefined}
        onWheel={!currentImage.isVideo ? handleWheel : undefined}
      >
        {/* Loading spinner — shown for images while loading, and for videos after play starts */}
        {isLoading && (!currentImage.isVideo || videoPlaying) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-12 w-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {currentImage.isVideo ? (
          /* Video player — shows play overlay until user clicks, then decrypts (if E2EE) and plays */
          <>
            {videoPlaying ? (
              <video
                key={currentImage.url}
                src={currentImage.url}
                controls
                autoPlay
                playsInline
                className={cn(
                  'max-h-[90vh] max-w-[90vw] object-contain',
                  isLoading ? 'opacity-0' : 'opacity-100'
                )}
                onCanPlay={() => setIsLoading(false)}
                onError={() => setIsLoading(false)}
              >
                {currentImage.mimeType && <source src={currentImage.url} type={currentImage.mimeType} />}
              </video>
            ) : (
              /* Play overlay — shown before user clicks play */
              <div
                className="flex items-center justify-center w-full h-full cursor-pointer"
                onClick={handleVideoPlayClick}
              >
                {currentImage.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentImage.thumbnailUrl}
                    alt={currentImage.fileName || 'Video'}
                    className="max-h-[90vh] max-w-[90vw] object-contain opacity-60"
                    onLoad={() => setIsLoading(false)}
                    onError={() => setIsLoading(false)}
                  />
                )}
                <div className="absolute flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors">
                    {isVideoDecrypting ? (
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    ) : (
                      <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Image */
          <img
            ref={imageRef}
            src={currentImage.url}
            alt={currentImage.caption || currentImage.fileName || 'Image'}
            className={cn(
              'max-h-[90vh] max-w-[90vw] object-contain transition-opacity duration-200',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
            draggable={false}
          />
        )}
      </div>

      {/* Caption */}
      {currentImage.caption && (
        <div className="absolute bottom-0 left-0 right-0 p-4 text-center bg-gradient-to-t from-black/50 to-transparent">
          <p className="text-white/90 text-sm">{currentImage.caption}</p>
        </div>
      )}
    </div>,
    document.getElementById('lightbox-root') ?? document.body
  );
}

export default ImageLightbox;
