import { invoke } from '@tauri-apps/api/core';

/**
 * Invoke a native AMT command.
 *
 * AMT is a desktop-only Tauri application. Native commands must stay on this
 * explicit client boundary.
 */
export async function request<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    throw new Error('AMT native commands are only available inside the desktop application.');
  }

  return invoke<T>(command, args);
}
