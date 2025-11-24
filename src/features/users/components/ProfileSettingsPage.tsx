'use client';

import { useUserStore } from '@/store/userStore';
import { ProfileInfoCard } from './ProfileInfoCard';
import { ProfileSettingsForm } from './ProfileSettingsForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Profile Settings Page Component
 *
 * Features:
 * - Displays current user's profile information (read-only TMS data)
 * - Allows editing of local settings (theme, notifications, privacy)
 * - Responsive layout: stack on mobile, grid on desktop
 * - Back button to return to chats
 * - Loading and error states
 *
 * Route: /settings
 */
export function ProfileSettingsPage() {
  const { currentUser } = useUserStore();
  const router = useRouter();

  const handleBack = () => {
    router.push('/chats');
  };

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-viber-purple mb-3" />
        <p className="text-sm text-gray-600">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Profile Information (Read-Only) */}
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-700 mb-1">Profile Information</h2>
              <p className="text-xs text-gray-500">
                Your profile information is managed by TMS and cannot be edited here.
              </p>
            </div>
            <ProfileInfoCard
              user={currentUser}
              variant="full"
              showOrganization={true}
            />
          </div>

          {/* Right Column: Settings (Editable) */}
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-700 mb-1">Preferences</h2>
              <p className="text-xs text-gray-500">
                Customize your messaging experience.
              </p>
            </div>
            <ProfileSettingsForm />
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-8 p-4 bg-viber-purple-bg rounded-lg border border-viber-purple/20">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Note:</span> To update your personal information (name, email, position),
            please contact your TMS administrator or update your profile in the TMS system.
          </p>
        </div>
      </div>
    </div>
  );
}
