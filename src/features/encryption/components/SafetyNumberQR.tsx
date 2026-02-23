/**
 * Safety Number QR Code
 * Renders a QR code of the safety number for verification
 */

'use client';

import { useState, useEffect, type ReactNode } from 'react';

interface SafetyNumberQRProps {
  safetyNumber: string;
  size?: number;
}

export function SafetyNumberQR({ safetyNumber, size = 200 }: SafetyNumberQRProps) {
  const [qrNode, setQrNode] = useState<ReactNode | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import('qrcode.react')
      .then((mod) => {
        const QRCodeSVG = mod.QRCodeSVG;
        setQrNode(
          <QRCodeSVG
            value={safetyNumber}
            size={size}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
          />
        );
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [safetyNumber, size]);

  if (!loaded) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 dark:bg-dark-border rounded-lg text-xs text-gray-400 animate-pulse"
        style={{ width: size, height: size }}
      />
    );
  }

  if (!qrNode) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 dark:bg-dark-border rounded-lg text-xs text-gray-400"
        style={{ width: size, height: size }}
      >
        QR code unavailable
      </div>
    );
  }

  return (
    <div className="bg-white p-3 rounded-lg inline-block">
      {qrNode}
    </div>
  );
}

export default SafetyNumberQR;
