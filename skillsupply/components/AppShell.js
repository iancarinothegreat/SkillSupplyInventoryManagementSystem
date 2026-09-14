'use client';
import { usePathname } from 'next/navigation';
import Layout from './Layout';

const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export default function AppShell({ children }) {
  const pathname = usePathname();

  const isAuthPage = AUTH_ROUTES.some(route => pathname === route);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return <Layout>{children}</Layout>;
}
