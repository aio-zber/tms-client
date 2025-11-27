'use client';
import { log } from '@/lib/logger';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getUserInitials, User } from '@/types';
import { useState, useEffect } from 'react';
import { authService } from '@/features/auth/services/authService';
import { STORAGE_KEYS } from '@/lib/constants';
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  BellOff,
  LogOut,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBadge, NotificationSettings } from '@/features/notifications';

export function AppHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Get JWT token from localStorage using correct key
        const jwtToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

        if (!jwtToken) {
          // No token, redirect to login
          window.location.href = '/login';
          return;
        }

        // Get user data from TMS Server using JWT Bearer token
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://tms-server-staging.up.railway.app/api/v1';
        const response = await fetch(`${apiBaseUrl}/users/me`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (response.ok) {
          const userData = await response.json();
          // API provides all required fields
          setUser(userData as User);
        } else if (response.status === 401) {
          // Token expired, clear storage and redirect to login
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          localStorage.removeItem('tms_session_active');
          window.location.href = '/login';
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        log.error('Failed to load user data:', error);
        // On error, clear auth and redirect to login
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem('tms_session_active');
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    // TODO: Implement actual theme switching
  };

  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    // TODO: Implement actual notification toggle
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setUser(null);
      // Redirect to login page
      window.location.href = '/login';
    } catch (error) {
      log.error('Logout failed:', error);
      // Even if logout fails, redirect to login for security
      window.location.href = '/login';
    }
  };

  // Show loading state if user is not loaded
  if (loading || !user) {
    return (
      <header className="h-[60px] md:h-[70px] bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-viber-purple">GCG Team Chat</h1>
        </div>
        <div className="animate-pulse">
          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="h-[60px] md:h-[70px] bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shrink-0">
      {/* App Branding */}
      <div className="flex items-center gap-2 md:gap-3">
        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-viber-purple">GCG Team Chat</h1>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Notification Badge */}
        <NotificationBadge onClick={async () => {
          const { useNotificationStore } = await import('@/store/notificationStore');
          const { toggleNotificationCenter } = useNotificationStore.getState();
          toggleNotificationCenter();
        }} />

        {/* Settings Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-2 md:px-3 py-2 rounded-lg hover:bg-gray-100 transition">
            <Avatar className="h-8 w-8 md:h-9 md:w-9">
              <AvatarFallback className="bg-viber-purple text-white font-semibold text-xs md:text-sm">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm md:text-base font-medium text-gray-900 hidden md:block">
              {user.username}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500 hidden md:block" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80">
          {/* Profile Section */}
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-viber-purple text-white font-semibold text-lg">
                    {getUserInitials(user)}
                  </AvatarFallback>
                </Avatar>
                {/* Online Status Indicator */}
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-viber-online border-2 border-white rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-base">
                  {user.username}
                </p>
                <p className="text-sm text-gray-600">{user.positionTitle}</p>
                <p className="text-xs text-gray-500 mt-1">{user.email}</p>
              </div>
            </div>

            {/* Bio/Custom Status */}
            <div className="px-3 py-2 bg-viber-purple-bg rounded-lg">
              <p className="text-sm text-gray-700">Working on TMA</p>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Theme Selector */}
          <DropdownMenuLabel className="text-xs text-gray-500 uppercase font-semibold">
            Theme
          </DropdownMenuLabel>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => handleThemeChange('light')}
          >
            <Sun className="w-4 h-4 mr-3" />
            <span>Light</span>
            {theme === 'light' && (
              <div className="ml-auto w-2 h-2 rounded-full bg-viber-purple" />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => handleThemeChange('dark')}
          >
            <Moon className="w-4 h-4 mr-3" />
            <span>Dark</span>
            {theme === 'dark' && (
              <div className="ml-auto w-2 h-2 rounded-full bg-viber-purple" />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => handleThemeChange('system')}
          >
            <Monitor className="w-4 h-4 mr-3" />
            <span>System</span>
            {theme === 'system' && (
              <div className="ml-auto w-2 h-2 rounded-full bg-viber-purple" />
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Notification Settings */}
          <DropdownMenuLabel className="text-xs text-gray-500 uppercase font-semibold">
            Notifications
          </DropdownMenuLabel>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={toggleNotifications}
          >
            {notificationsEnabled ? (
              <Bell className="w-4 h-4 mr-3" />
            ) : (
              <BellOff className="w-4 h-4 mr-3" />
            )}
            <span>Quick Toggle</span>
            <div className="ml-auto flex items-center">
              <div
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  notificationsEnabled ? 'bg-viber-purple' : 'bg-gray-200'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                  )}
                />
              </div>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setNotificationSettingsOpen(true)}
          >
            <Settings className="w-4 h-4 mr-3" />
            <span>Notification Settings</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-3" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      {/* Notification Settings Dialog */}
      <Dialog open={notificationSettingsOpen} onOpenChange={setNotificationSettingsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notification Settings</DialogTitle>
          </DialogHeader>
          <NotificationSettings />
        </DialogContent>
      </Dialog>
    </header>
  );
}
