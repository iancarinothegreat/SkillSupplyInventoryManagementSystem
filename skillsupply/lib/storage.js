'use client';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function storage() {
  if (typeof window === 'undefined') return null;
  return sessionStorage;
}

export function getToken() {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function setToken(token) {
  storage()?.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  storage()?.removeItem(TOKEN_KEY);
}

export function getUser() {
  const raw = storage()?.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    storage()?.removeItem(USER_KEY);
    return null;
  }
}

export function setUser(user) {
  storage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser() {
  storage()?.removeItem(USER_KEY);
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
