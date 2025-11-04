/**
 * Image URL utilities
 * Handles profile images from GCGC Team Management System
 *
 * NOTE: This is the ONLY place where direct GCGC URLs are allowed,
 * because we're accessing static uploaded files, not making API calls.
 */

import { GCGC_FILE_URL } from './constants';

/**
 * Get full URL for user profile image.
 * Converts relative paths to absolute URLs pointing to GCGC's file storage.
 *
 * @param imageUrl - Image URL from user data (can be relative or absolute)
 * @returns Full absolute URL or undefined if no image
 *
 * @example
 * // Relative path
 * getUserImageUrl('/uploads/profiles/user-123.jpg')
 * // Returns: 'https://gcgc-team-management-system-staging.up.railway.app/uploads/profiles/user-123.jpg'
 *
 * // Already absolute
 * getUserImageUrl('https://example.com/image.jpg')
 * // Returns: 'https://example.com/image.jpg'
 *
 * // Cloudinary URL
 * getUserImageUrl('https://res.cloudinary.com/...')
 * // Returns: 'https://res.cloudinary.com/...'
 */
export function getUserImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;

  // Already an absolute URL (http:// or https://)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Relative path - prepend GCGC file storage URL
  // Remove leading slash if present to avoid double slashes
  const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
  return `${GCGC_FILE_URL}/${cleanPath}`;
}

/**
 * Get conversation avatar URL.
 * Similar to getUserImageUrl but for conversation/group avatars.
 *
 * @param avatarUrl - Avatar URL from conversation data
 * @returns Full absolute URL or undefined if no avatar
 */
export function getConversationAvatarUrl(avatarUrl?: string | null): string | undefined {
  return getUserImageUrl(avatarUrl);
}

/**
 * Preload image to check if it exists.
 * Returns a promise that resolves with the image URL if loaded, or undefined if failed.
 *
 * @param imageUrl - Image URL to preload
 * @returns Promise that resolves with URL or undefined
 *
 * @example
 * const url = await preloadImage(userImageUrl);
 * if (url) {
 *   // Image loaded successfully
 * } else {
 *   // Show fallback/initials
 * }
 */
export function preloadImage(imageUrl?: string | null): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!imageUrl) {
      resolve(undefined);
      return;
    }

    const img = new Image();
    img.onload = () => resolve(imageUrl);
    img.onerror = () => resolve(undefined);
    img.src = imageUrl;
  });
}
