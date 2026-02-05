import { SpeedLimitOption } from '@/types';

export const SpeedLimits: SpeedLimitOption[] = [
  { id: 'unlimited', label: 'Unlimited', value: null },
  { id: '500k', label: '500 KB/s', value: 500 * 1024 },
  { id: '1m', label: '1 MB/s', value: 1024 * 1024 },
  { id: '2m', label: '2 MB/s', value: 2 * 1024 * 1024 },
  { id: '5m', label: '5 MB/s', value: 5 * 1024 * 1024 },
  { id: '10m', label: '10 MB/s', value: 10 * 1024 * 1024 },
];
