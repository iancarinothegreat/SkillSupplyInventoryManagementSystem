'use client';
import { useEffect } from 'react';

const INVENTORY_UPDATE_KEY = 'inventory-updated';
const REQUISITION_UPDATE_KEY = 'requisition-updated';
const USER_UPDATED_KEY = 'user-updated';

function notify(key) {
  window.dispatchEvent(new Event(key));
  try {
    localStorage.setItem(key, Date.now().toString());
  } catch {}
}

export function broadcastInventoryUpdate() {
  notify(INVENTORY_UPDATE_KEY);
}

export function broadcastRequisitionUpdate() {
  notify(REQUISITION_UPDATE_KEY);
}

export function broadcastUserUpdate() {
  notify(USER_UPDATED_KEY);
}

export function useCrossTabEvent(key, callback) {
  useEffect(() => {
    const handler = () => callback();

    window.addEventListener(key, handler);

    const onStorage = (e) => {
      if (e.key === key && e.newValue) {
        callback();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(key, handler);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, callback]);
}

export function useStorageEvent(key, callback) {
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key && e.newValue) {
        callback();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, callback]);
}

export function useInventoryUpdates(callback) {
  return useCrossTabEvent(INVENTORY_UPDATE_KEY, callback);
}

export function useInventoryUpdatesCrossTab(callback) {
  return useStorageEvent(INVENTORY_UPDATE_KEY, callback);
}

export function useRequisitionUpdates(callback) {
  return useCrossTabEvent(REQUISITION_UPDATE_KEY, callback);
}

export function useUserUpdates(callback) {
  return useCrossTabEvent(USER_UPDATED_KEY, callback);
}

export function usePolling(callback, intervalMs = 60000) {
  useEffect(() => {
    const id = setInterval(() => callback(), intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs]);
}
