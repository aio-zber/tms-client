'use client';

import React, { useState, useEffect } from 'react';
import { X, File, FileText, FileSpreadsheet, Video, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilePreviewProps {
  file: File;
  uploadProgress?: number;
  isUploading?: boolean;
  onRemove: () => void;
  className?: string;
}

/**
 * Compact file chip for the horizontal pre-send strip (Messenger pattern).
 * Fixed 72×72 square: image thumbnail or file-type icon + name + progress ring.
 */
export function FilePreview({
  file,
  uploadProgress = 0,
  isUploading = false,
  onRemove,
  className,
}: FilePreviewProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) { setImagePreview(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    return () => setImagePreview(null);
  }, [file]);

  const icon = (() => {
    if (file.type.startsWith('video/')) return <Video className="w-6 h-6 text-purple-400" />;
    if (file.type.startsWith('audio/')) return <Music className="w-6 h-6 text-green-400" />;
    if (file.type.includes('pdf'))      return <FileText className="w-6 h-6 text-red-400" />;
    if (file.type.includes('word') || file.type.includes('document'))
                                        return <FileText className="w-6 h-6 text-blue-400" />;
    if (file.type.includes('excel') || file.type.includes('spreadsheet'))
                                        return <FileSpreadsheet className="w-6 h-6 text-green-500" />;
    return <File className="w-6 h-6 text-gray-400" />;
  })();

  // Truncate filename to fit chip
  const shortName = file.name.length > 12
    ? file.name.slice(0, 9) + '…' + (file.name.split('.').pop() ? '.' + file.name.split('.').pop() : '')
    : file.name;

  return (
    <div className={cn('relative flex-shrink-0 w-[72px]', className)}>
      {/* Thumbnail / icon box */}
      <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface flex items-center justify-center">
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          icon
        )}

        {/* Upload progress overlay */}
        {isUploading && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{Math.round(uploadProgress)}%</span>
          </div>
        )}
      </div>

      {/* Filename */}
      <p className="mt-1 text-[10px] text-center text-gray-500 dark:text-dark-text-secondary truncate leading-tight">
        {shortName}
      </p>

      {/* Remove button — top-right corner */}
      {!isUploading && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove file"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-500 dark:bg-gray-600 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default FilePreview;
