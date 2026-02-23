'use client';

import React, { useState } from 'react';
import { Maximize2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
  isSent: boolean;
  onExpandClick: () => void;
}

/**
 * Inline video player for message bubbles.
 * Shows video with native controls and expand button for fullscreen.
 */
export function VideoPlayer({
  src,
  thumbnailUrl,
  mimeType,
  fileName,
  isSent,
  onExpandClick,
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);

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
        {mimeType && <source src={src} type={mimeType} />}
        Your browser does not support video playback.
      </video>

      {/* Play button overlay (when not playing) */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            const video = e.currentTarget.parentElement?.querySelector('video');
            if (video) {
              video.play();
            }
          }}
        >
          <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors">
            <Play className="h-7 w-7 text-gray-900 ml-1" fill="currentColor" />
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
