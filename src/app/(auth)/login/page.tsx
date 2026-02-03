'use client';

import { log } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { authService } from '@/features/auth/services/authService';

// Form validation schema
const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters' }),
  rememberMe: z.boolean().default(false),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuth(false);

  const [showEmergencyLogin, setShowEmergencyLogin] = useState(false);

  // Check for GCGC session on mount - redirect if already logged in
  useEffect(() => {
    const gcgcToken = authService.extractSessionToken();
    if (gcgcToken) {
      log.auth.info('🔐 SSO: GCGC session detected on login page, redirecting to root for auto-login...');
      router.push('/');
    } else {
      // No GCGC session, redirect to GCGC login
      const redirectToGCGC = () => {
        const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL || '';
        window.location.href = `${gcgcLoginUrl}?callbackUrl=${encodeURIComponent(window.location.origin)}`;
      };

      // Give a brief moment for user to see the page, then redirect
      const timer = setTimeout(redirectToGCGC, 1500);
      return () => clearTimeout(timer);
    }
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    clearError(); // Clear previous errors

    try {
      await login({
        email: data.email,
        password: data.password,
      });

      // Success! Show toast and redirect
      toast.success('Login successful! Redirecting to chats...', {
        duration: 2000,
        icon: '✅',
      });

      // Small delay to let user see the success message
      setTimeout(() => {
        router.push('/chats');
      }, 500);

    } catch (err: unknown) {
      // Error is already in auth store, show toast
      const errorMessage = (err as Error)?.message || error || 'Login failed. Please try again.';
      toast.error(errorMessage, {
        duration: 4000,
        icon: '❌',
      });
    }
  };

  // If emergency login not shown, display redirect message
  if (!showEmergencyLogin) {
    return (
      <>
        <Toaster position="top-center" />
        <Card className="shadow-xl border-gray-200 max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-viber-purple rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold">
              Redirecting to GCGC Login
            </CardTitle>
            <CardDescription className="text-base">
              TMS is part of the GCGC Team Management System.
              <br />
              You need to login through GCGC to access TMS.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full"></div>
            </div>

            <p className="text-center text-sm text-gray-600">
              Redirecting you to GCGC login...
            </p>

            <div className="pt-4 border-t">
              <button
                onClick={() => setShowEmergencyLogin(true)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Emergency login (for troubleshooting only)
              </button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // Emergency login form (fallback)
  return (
    <>
      <Toaster position="top-center" />
      <Card className="shadow-xl border-gray-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center text-amber-600">
            ⚠️ Emergency Login
          </CardTitle>
          <CardDescription className="text-center">
            This is for troubleshooting only. Please use GCGC login normally.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600 text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="pl-10"
                {...register('email')}
                disabled={isLoading}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-10 pr-10"
                {...register('password')}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="rememberMe"
              {...register('rememberMe')}
              className="w-4 h-4 text-viber-purple border-gray-300 rounded focus:ring-viber-purple focus:ring-2"
              disabled={isLoading}
            />
            <Label
              htmlFor="rememberMe"
              className="text-sm font-normal cursor-pointer"
            >
              Remember me
            </Label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-viber-purple hover:bg-viber-purple-dark text-white font-medium"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col space-y-2 text-center text-sm text-gray-600">
        <p>
          Don&apos;t have an account?{' '}
          <a href="#" className="text-viber-purple hover:underline font-medium">
            Contact your admin
          </a>
        </p>
        <p className="text-xs text-gray-400 mt-4">
          ✨ Real authentication with TMS
        </p>
      </CardFooter>
    </Card>
    </>
  );
}
