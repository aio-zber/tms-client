'use client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getUserInitials, User } from '@/types';
import { useState, useEffect } from 'react';
import { tmsApi } from '@/lib/tmsApi';
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  Bell,
  BellOff,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Get user data from GCGC Team Management System using session
        const response = await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`, {
          credentials: 'include', // Include session cookies
        });

        if (response.ok) {
          const userData = await response.json();
          // Transform GCGC user data to app user format
          const transformedUser = {
            id: userData.id,
            email: userData.email,
            name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username || 'User',
            role: userData.role || 'member',
            image: userData.image,
            // Add other fields as needed
            firstName: userData.firstName,
            lastName: userData.lastName,
            positionTitle: userData.positionTitle,
            division: userData.division,
            department: userData.department,
          };
          setUser(transformedUser);
        } else if (response.status === 401) {
          // Session expired, redirect to login
          window.location.href = '/login';
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Redirect to login on any error
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
    console.log('Theme changed to:', newTheme);
  };

  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    // TODO: Implement actual notification toggle
    console.log('Notifications:', !notificationsEnabled);
  };

  const handleLogout = async () => {
    try {
      await tmsApi.logout();
      setUser(null);
      // TODO: Redirect to login page
      console.log('User logged out');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Show loading state if user is not loaded
  if (loading || !user) {
    return (
      <header className="h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-viber-purple">GCG Team Chat</h1>
        </div>
        <div className="animate-pulse">
          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      {/* App Branding */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-viber-purple">GCG Team Chat</h1>
      </div>

      {/* Settings Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-viber-purple text-white font-semibold text-xs">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-900 hidden md:block">
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

          {/* Profile Settings */}
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="w-4 h-4 mr-3" />
            <span>Profile Settings</span>
          </DropdownMenuItem>

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

          {/* Notifications Toggle */}
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={toggleNotifications}
          >
            {notificationsEnabled ? (
              <Bell className="w-4 h-4 mr-3" />
            ) : (
              <BellOff className="w-4 h-4 mr-3" />
            )}
            <span>Notifications</span>
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
    </header>
  );
}
