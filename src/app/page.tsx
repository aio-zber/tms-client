import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to login or chats based on auth state
  // For now, redirect to login
  redirect('/login');
}
