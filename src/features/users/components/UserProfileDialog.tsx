import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProfileInfoCard } from './ProfileInfoCard';
import { useUserProfile } from '../hooks/useUserProfile';
import { Loader2, MessageCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useConversations } from '@/features/conversations/hooks/useConversations';
import type { User } from '@/types/user';

interface UserProfileDialogProps {
  userId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showSendMessageButton?: boolean;
  userData?: Partial<User>; // Allow passing user data directly from conversation members
}

/**
 * Modal dialog for viewing another user's profile
 *
 * Features:
 * - Fetches user data with loading/error states
 * - Displays full profile information
 * - Optional "Send Message" button to start DM
 * - Responsive: full-screen on mobile, centered on desktop
 * - Accessible with proper ARIA labels
 *
 * Used in:
 * - ChatHeader "View Profile" option (DM conversations)
 * - ConversationSettingsDialog member list (group chats)
 */
export function UserProfileDialog({
  userId,
  open,
  onOpenChange,
  showSendMessageButton = true,
  userData,
}: UserProfileDialogProps) {
  const { user: fetchedUser, loading, error } = useUserProfile(userId);
  const router = useRouter();
  const { conversations } = useConversations();

  // Use provided userData if available (from conversation members), otherwise use fetched user
  const user = userData ? { ...fetchedUser, ...userData } as User : fetchedUser;

  // Find existing DM conversation with this user
  const findDMConversation = () => {
    if (!userId) return null;
    return conversations.find(
      (conv) => conv.type === 'dm' && conv.members.some((m) => m.userId === userId)
    );
  };

  const handleSendMessage = () => {
    const existingDM = findDMConversation();

    if (existingDM) {
      // Navigate to existing DM
      router.push(`/chats/${existingDM.id}`);
    } else {
      // Create new DM conversation
      // The conversation will be created when user sends first message
      router.push(`/chats?newDM=${userId}`);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold">Profile</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto px-6 pb-6">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-viber-purple mb-3" />
              <p className="text-sm text-gray-600">Loading profile...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-sm text-red-600 text-center">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="mt-4"
              >
                Close
              </Button>
            </div>
          )}

          {/* Profile Content */}
          {user && !loading && !error && (
            <div className="space-y-4">
              <ProfileInfoCard user={user} variant="full" showOrganization={true} />

              {/* Action Buttons */}
              {showSendMessageButton && (
                <Button
                  onClick={handleSendMessage}
                  className="w-full bg-viber-purple hover:bg-viber-purple-dark text-white"
                  size="lg"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Send Message
                </Button>
              )}
            </div>
          )}

          {/* No User State */}
          {!userId && !loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-gray-600">No user selected</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
