'use client';
import {
  broadcastRequisitionUpdate as _broadcastRequisitionUpdate,
  useRequisitionUpdates as _useRequisitionUpdates,
  usePolling as _usePolling,
} from './events';

export const broadcastRequisitionUpdate = _broadcastRequisitionUpdate;
export const useRequisitionUpdates = _useRequisitionUpdates;
export const useRequisitionPolling = _usePolling;
