import { buildExportPayload, parseImportBundle } from './studyData';
import type { JournalEntry, StudyEntry } from '../types';

const META_KEY = 'study-tracker.meta.v1';
const HANDLE_DB = 'study-tracker.file-handles.v1';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'primary-data-file';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NO_BACKUP_DISMISS_MS = 24 * 60 * 60 * 1000;

export type StorageMode = 'localStorage' | 'file';

export interface PersistenceMeta {
  storageMode: StorageMode;
  lastBackupAt?: string;
  backupReminderDismissedAt?: string;
}

export type StoredFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (contents: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

export interface PersistedAppData {
  entries: StudyEntry[];
  journalEntries: JournalEntry[];
}

type FilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
      excludeAcceptAllOption?: boolean;
    }) => Promise<StoredFileHandle>;
  };

const defaultMeta: PersistenceMeta = {
  storageMode: 'localStorage',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const openHandleDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(HANDLE_DB, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE)) {
        database.createObjectStore(HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
  });

const withHandleStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) => {
  const database = await openHandleDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, mode);
    const store = transaction.objectStore(HANDLE_STORE);

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };

    action(store, resolve, reject);
  });
};

export const readPersistenceMeta = (): PersistenceMeta => {
  if (typeof window === 'undefined') {
    return defaultMeta;
  }

  const raw = window.localStorage.getItem(META_KEY);
  if (!raw) {
    return defaultMeta;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return defaultMeta;
    }

    return {
      storageMode: parsed.storageMode === 'file' ? 'file' : 'localStorage',
      lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : undefined,
      backupReminderDismissedAt:
        typeof parsed.backupReminderDismissedAt === 'string' ? parsed.backupReminderDismissedAt : undefined,
    };
  } catch {
    return defaultMeta;
  }
};

export const writePersistenceMeta = (meta: PersistenceMeta) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
};

export const updatePersistenceMeta = (changes: Partial<PersistenceMeta>) => {
  const nextMeta = {
    ...readPersistenceMeta(),
    ...changes,
  };

  writePersistenceMeta(nextMeta);
  return nextMeta;
};

export const markBackupComplete = () =>
  updatePersistenceMeta({
    lastBackupAt: new Date().toISOString(),
    backupReminderDismissedAt: undefined,
  });

export const dismissBackupReminder = () =>
  updatePersistenceMeta({
    backupReminderDismissedAt: new Date().toISOString(),
  });

export const shouldShowBackupReminder = (meta: PersistenceMeta, now = Date.now()) => {
  const dismissedAt = meta.backupReminderDismissedAt ? Date.parse(meta.backupReminderDismissedAt) : 0;

  if (!meta.lastBackupAt) {
    return !dismissedAt || now - dismissedAt > NO_BACKUP_DISMISS_MS;
  }

  const nextReminderAt = Date.parse(meta.lastBackupAt) + SEVEN_DAYS_MS;
  return now >= nextReminderAt && dismissedAt < nextReminderAt;
};

export const supportsFileStorage = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return typeof (window as FilePickerWindow).showSaveFilePicker === 'function' && 'indexedDB' in window;
};

export const getTimestampedBackupFilename = (date = new Date()) => {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];

  return `study-tracker-backup-${parts.join('')}-${time.join('')}.json`;
};

export const formatDateTimeLabel = (value?: string) => {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

export const pickDataFile = async () => {
  const pickerWindow = window as FilePickerWindow;

  if (!pickerWindow.showSaveFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }

  return pickerWindow.showSaveFilePicker({
    suggestedName: 'study-tracker-data.json',
    excludeAcceptAllOption: true,
    types: [
      {
        description: 'JSON data file',
        accept: {
          'application/json': ['.json'],
        },
      },
    ],
  });
};

export const saveFileHandle = async (handle: StoredFileHandle) => {
  await withHandleStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to save the file handle.'));
  });
};

export const loadSavedFileHandle = async () =>
  withHandleStore<StoredFileHandle | null>('readonly', (store, resolve, reject) => {
    const request = store.get(HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as StoredFileHandle | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Unable to read the saved file handle.'));
  });

export const readAppDataFromFile = async (handle: StoredFileHandle): Promise<PersistedAppData | null> => {
  if (handle.queryPermission) {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'denied') {
      throw new Error('Permission to access the selected data file was denied.');
    }
  }

  const file = await handle.getFile();
  const raw = await file.text();

  if (!raw.trim()) {
    return null;
  }

  return parseImportBundle(raw);
};

export const writeAppDataToFile = async (
  handle: StoredFileHandle,
  entries: StudyEntry[],
  journalEntries: JournalEntry[],
) => {
  const writable = await handle.createWritable();

  try {
    await writable.write(JSON.stringify(buildExportPayload(entries, journalEntries), null, 2));
  } finally {
    await writable.close();
  }
};
