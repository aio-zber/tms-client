/**
 * OnlineIndicator Component
 * Displays a green dot to indicate online status (Messenger-style).
 *
 * Positioning: Designed to be placed inside a relative container (like Avatar wrapper)
 * and positioned at the bottom-right corner.
 */

import { cn } from '@/lib/utils';

interface OnlineIndicatorProps {
  /**
   * Whether the user is online
   */
  isOnline: boolean;

  /**
   * Size variant of the indicator
   * - 'sm': 8px (for small avatars, ~32px)
   * - 'md': 10px (for medium avatars, ~40px) - default
   * - 'lg': 12px (for large avatars, ~48px+)
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Border color to match the background
   * Default: white
   */
  borderColor?: string;
}

const sizeClasses = {
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border-2',
  lg: 'w-3 h-3 border-2',
};

export function OnlineIndicator({
  isOnline,
  size = 'md',
  className,
  borderColor = 'border-white',
}: OnlineIndicatorProps) {
  // Don't render anything if user is offline
  if (!isOnline) {
    return null;
  }

  return (
    <span
      className={cn(
        // Base styles
        'absolute rounded-full',
        // Position at bottom-right of parent
        'bottom-0 right-0',
        // Online indicator color (Viber green)
        'bg-viber-online',
        // Border to create separation from avatar
        borderColor,
        // Size variant
        sizeClasses[size],
        // Custom classes
        className
      )}
      aria-label="Online"
      role="status"
    />
  );
}

export default OnlineIndicator;
