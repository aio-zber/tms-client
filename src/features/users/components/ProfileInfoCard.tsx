import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getUserDisplayName, getUserInitials, isAdmin, isLeader, getOrganizationPath } from '@/types/user';
import type { User } from '@/types/user';
import { Mail, Briefcase, Building2, User as UserIcon } from 'lucide-react';

interface ProfileInfoCardProps {
  user: Partial<User> & Pick<User, 'id'>;
  variant?: 'full' | 'compact';
  showOrganization?: boolean;
  className?: string;
}

/**
 * Reusable profile information card component
 *
 * Features:
 * - Displays user avatar, name, email, role, position
 * - Two variants: full (all details) and compact (basic info)
 * - Optional organization hierarchy display
 * - Role badges with color coding
 * - Viber purple accents
 *
 * Used in:
 * - ProfileSettingsPage
 * - UserProfileDialog
 * - Any other profile display needs
 */
export function ProfileInfoCard({
  user,
  variant = 'full',
  showOrganization = true,
  className = '',
}: ProfileInfoCardProps) {
  const displayName = getUserDisplayName(user as User);
  const initials = getUserInitials(user as User);
  const orgPath = user.division || user.department || user.section ? getOrganizationPath(user as User) : null;

  // Determine role badge
  const getRoleBadge = () => {
    if (!user.role) return null;
    if (isAdmin(user as User)) {
      return <Badge className="bg-viber-purple text-white">Admin</Badge>;
    }
    if (isLeader(user as User)) {
      return <Badge className="bg-blue-500 text-white">Leader</Badge>;
    }
    return <Badge variant="secondary">Member</Badge>;
  };

  if (variant === 'compact') {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <Avatar className="w-12 h-12">
            <AvatarImage src={user.image} alt={displayName} />
            <AvatarFallback className="bg-viber-purple text-white">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Basic Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{displayName}</h3>
            {user.email && (
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary truncate">{user.email}</p>
            )}
          </div>

          {/* Role Badge */}
          {getRoleBadge()}
        </div>
      </Card>
    );
  }

  // Full variant
  return (
    <Card className={`p-6 ${className}`}>
      {/* Avatar and Name Section */}
      <div className="flex flex-col items-center text-center mb-6">
        <Avatar className="w-24 h-24 mb-4">
          <AvatarImage src={user.image} alt={displayName} />
          <AvatarFallback className="bg-viber-purple text-white text-3xl">
            {initials}
          </AvatarFallback>
        </Avatar>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-1">{displayName}</h2>

        {user.positionTitle && (
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-2">{user.positionTitle}</p>
        )}

        <div className="flex items-center gap-2">
          {getRoleBadge()}
          {user.isActive && (
            <Badge variant="outline" className="text-viber-online border-viber-online">
              Active
            </Badge>
          )}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Contact Information */}
      <div className="space-y-3">
        {user.email && (
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-0.5">Email</p>
              <p className="text-sm text-gray-900 dark:text-dark-text break-all">{user.email}</p>
            </div>
          </div>
        )}

        {user.positionTitle && (
          <div className="flex items-start gap-3">
            <Briefcase className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-0.5">Position</p>
              <p className="text-sm text-gray-900 dark:text-dark-text">{user.positionTitle}</p>
            </div>
          </div>
        )}

        {showOrganization && orgPath && (
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-0.5">Organization</p>
              <p className="text-sm text-gray-900 dark:text-dark-text">{orgPath}</p>
            </div>
          </div>
        )}

        {(user.username || user.tmsUserId) && (
          <div className="flex items-start gap-3">
            <UserIcon className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mb-0.5">Username</p>
              <p className="text-sm text-gray-900 dark:text-dark-text">
                {user.username || `@${user.tmsUserId}`}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
