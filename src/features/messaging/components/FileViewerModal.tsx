'use client';

import React, { useState } from 'react';
import { X, Download, ExternalLink, FileText, FileSpreadsheet, File } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileViewerModalProps {
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  onClose: () => void;
}

/**
 * Modal for viewing/previewing files.
 * - PDFs: Embedded viewer using iframe
 * - Office docs: Google Docs Viewer
 * - Images: Direct display
 * - Others: Download prompt with preview info
 */
export function FileViewerModal({
  fileUrl,
  fileName,
  mimeType = '',
  onClose,
}: FileViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Determine file type for appropriate viewer
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isImage = mimeType.startsWith('image/');
  const isOfficeDoc =
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    fileName.toLowerCase().endsWith('.doc') ||
    fileName.toLowerCase().endsWith('.docx') ||
    fileName.toLowerCase().endsWith('.xls') ||
    fileName.toLowerCase().endsWith('.xlsx');

  // Google Docs Viewer URL for office documents
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;

  // Get file icon based on type
  const getFileIcon = () => {
    if (isPdf) return <FileText className="h-16 w-16 text-red-500" />;
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileText className="h-16 w-16 text-blue-600" />;
    }
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return <FileSpreadsheet className="h-16 w-16 text-green-600" />;
    }
    return <File className="h-16 w-16 text-gray-500" />;
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle download
  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-3 text-white min-w-0">
          <span className="text-sm font-medium truncate max-w-[300px] md:max-w-[500px]">
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Open in new tab */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.open(fileUrl, '_blank')}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Open in new tab"
          >
            <ExternalLink className="h-5 w-5" />
          </Button>
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

      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {/* Loading indicator */}
        {isLoading && !hasError && (isPdf || isOfficeDoc || isImage) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="h-12 w-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* PDF Viewer */}
        {isPdf && !hasError && (
          <iframe
            src={`${fileUrl}#toolbar=1&navpanes=0`}
            className="w-full h-full max-w-5xl rounded-lg bg-white"
            title={fileName}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Office Document Viewer (Google Docs) */}
        {isOfficeDoc && !hasError && (
          <iframe
            src={googleViewerUrl}
            className="w-full h-full max-w-5xl rounded-lg bg-white"
            title={fileName}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Image Viewer */}
        {isImage && !hasError && (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-h-full max-w-full object-contain rounded-lg"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Unsupported file type or error fallback */}
        {(!isPdf && !isOfficeDoc && !isImage) || hasError ? (
          <div className="flex flex-col items-center gap-6 text-white p-8 bg-gray-800/50 rounded-2xl max-w-md">
            {getFileIcon()}
            <div className="text-center">
              <p className="text-lg font-medium mb-2">{fileName}</p>
              <p className="text-sm text-gray-300 mb-4">
                {hasError
                  ? 'Unable to preview this file. You can download it instead.'
                  : 'This file type cannot be previewed in the browser.'}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleDownload}
                className="bg-viber-purple hover:bg-viber-purple-dark"
              >
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(fileUrl, '_blank')}
                className="border-white/30 text-white hover:bg-white/10"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Browser
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default FileViewerModal;
