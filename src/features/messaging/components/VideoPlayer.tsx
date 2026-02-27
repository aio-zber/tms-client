'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Maximize2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string | undefined;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
  isSent: boolean;
  /** For E2EE videos: called on play-click to decrypt and return a blob URL. */
  onPlayClick?: () => Promise<string | null>;
  /** True while E2EE decryption is in progress — shows a spinner on the play button. */
  isDecrypting?: boolean;
  onExpandClick: () => void;
}

/**
 * Inline video player for message bubbles.
 * Shows video with native controls and expand button for fullscreen.
 *
 * For E2EE videos, pass onPlayClick — the component will call it on first play,
 * wait for the blob URL, then start playback. This defers the full file download
 * to when the user explicitly requests it, matching Messenger's approach.
 */
export function VideoPlayer({
  src,
  thumbnailUrl,
  mimeType,
  fileName,
  isSent,
  onPlayClick,
  isDecrypting = false,
  onExpandClick,
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayOverlayClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlayClick) {
      // E2EE path: decrypt first, then play
      const blobUrl = await onPlayClick();
      if (blobUrl && videoRef.current) {
        const video = videoRef.current;
        video.src = blobUrl;
        // Wait for the browser to load the new src before calling play().
        // Calling play() immediately after setting src races with the load
        // and causes an AbortError ("play() interrupted by a new load request").
        video.load();
        video.addEventListener('canplay', () => { video.play().catch(() => {}); }, { once: true });
      }
    } else if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden group cursor-pointer',
        isSent ? 'rounded-br-sm' : 'rounded-bl-sm'
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={thumbnailUrl}
        controls={isPlaying}
        playsInline
        preload="none"
        className="max-w-xs md:max-w-sm max-h-64 md:max-h-80 object-contain bg-black"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      >
        {src && mimeType && <source src={src} type={mimeType} />}
        Your browser does not support video playback.
      </video>

      {/* Play button overlay (when not playing) */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
          onClick={handlePlayOverlayClick}
        >
          <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors">
            {isDecrypting ? (
              <Loader2 className="h-7 w-7 text-gray-700 animate-spin" />
            ) : (
              <Play className="h-7 w-7 text-gray-900 ml-1" fill="currentColor" />
            )}
          </div>
        </div>
      )}

      {/* Expand button (visible on hover or when controls shown) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExpandClick();
        }}
        className={cn(
          'absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white transition-opacity',
          'hover:bg-black/70',
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        )}
        title="Expand video"
        aria-label="Expand video to fullscreen"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      {/* File name (optional, visible on hover when not playing) */}
      {fileName && !isPlaying && showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
          <p className="text-white text-xs truncate">{fileName}</p>
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
