import { LocalStorageDriver } from "./local";

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

// Swap here when a real backend (Vercel Blob / S3) lands — callers never change.
export const storage: StorageDriver = new LocalStorageDriver();
export { LocalStorageDriver };
