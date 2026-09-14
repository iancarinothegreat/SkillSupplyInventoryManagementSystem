'use client';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setUser(user) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(USER_KEY);
}

export function clearAuth() {
  removeToken();
  removeUser();
}

export function getSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('sidebar_collapsed') === 'true';
}

export function setSidebarCollapsed(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('sidebar_collapsed', String(value));
}
