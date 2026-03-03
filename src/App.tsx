import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Accordion,
  Anchor,
  AppShell,
  Badge,
  Burger,
  Button,
  Card,
  Group,
  Header,
  MediaQuery,
  Navbar,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import AuthScreen from './components/AuthScreen';
import BackupReminder from './components/BackupReminder';
import EntryCard from './components/EntryCard';
import EntryDrawer from './components/EntryDrawer';
import FocusPanel from './components/FocusPanel';
import JournalPanel from './components/JournalPanel';
import LibraryFilters from './components/LibraryFilters';
import QuickAddCard from './components/QuickAddCard';
import SettingsPanel from './components/SettingsPanel';
import StatsPanel from './components/StatsPanel';
import {
  buildExportPayload,
  clearLocalEntries,
  clearLocalJournalEntries,
  collectCompanies,
  collectTags,
  duplicateStudyEntry,
  filterEntries,
  formatDateLabel,
  getEntryTags,
  hasJournalText,
  loadExistingLocalEntries,
  loadEntries,
  loadJournalEntries,
  mergeJournalEntries,
  mergeEntries,
  parseImportBundle,
  persistLastUsedCodeLanguage,
  saveEntries,
  saveJournalEntries,
  sortEntries,
  supportsReview,
  toggleReview,
  todayISO,
} from './lib/studyData';
import { loadCloudAppData, replaceCloudAppData } from './lib/cloudData';
import {
  dismissBackupReminder,
  formatDateTimeLabel,
  getTimestampedBackupFilename,
  loadSavedFileHandle,
  markBackupComplete,
  pickDataFile,
  readAppDataFromFile,
  readPersistenceMeta,
  saveFileHandle,
  shouldShowBackupReminder,
  supportsFileStorage,
  updatePersistenceMeta,
  writeAppDataToFile,
  type StorageMode,
  type StoredFileHandle,
} from './lib/persistence';
import {
  TIMER_PRESET_CATEGORIES,
  clearLocalTimeSessions,
  ensureTimerCategories,
  loadActiveTimerState,
  loadTimeSessions,
  loadTimerCategories,
  mergeTimeSessions,
  saveActiveTimerState,
  saveTimeSessions,
  saveTimerCategories,
  sortTimeSessions,
  type ActiveTimerState,
  type TimeSession,
} from './lib/timeTracker';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { ENTRY_TYPES, type EntryType, type JournalEntry, type LibraryFilters as LibraryFiltersShape, type StudyEntry } from './types';

type PageKey = 'Today' | 'Focus' | 'Library' | 'Journal' | 'Stats' | 'Settings';
type LibraryViewMode = 'grouped' | 'table';
type LibrarySortMode = 'date' | 'type';
type NavItemId = 'today' | 'focus' | 'library' | 'journal' | 'stats' | 'settings';
type DataSyncMode = 'cloud' | 'local';
type HashRoute = {
  page: PageKey;
  journalDateISO?: string;
};

const NAV_ORDER_STORAGE_KEY = 'study-tracker.nav-order.v1';
const DATA_SYNC_MODE_STORAGE_KEY = 'study-tracker.data-sync-mode.v1';

const NAV_ITEMS: Array<{ id: NavItemId; key: PageKey; label: string; icon: string }> = [
  { id: 'today', key: 'Today', label: 'Today', icon: '📅' },
  { id: 'focus', key: 'Focus', label: 'Focus', icon: '🍅' },
  { id: 'library', key: 'Library', label: 'Library', icon: '📚' },
  { id: 'journal', key: 'Journal', label: 'Journal', icon: '📝' },
  { id: 'stats', key: 'Stats', label: 'Stats', icon: '📊' },
  { id: 'settings', key: 'Settings', label: 'Settings', icon: '⚙️' },
];

const DEFAULT_NAV_ORDER: NavItemId[] = NAV_ITEMS.map((item) => item.id);
const PAGE_HASH_SEGMENTS: Record<PageKey, string> = {
  Today: 'today',
  Focus: 'focus',
  Library: 'library',
  Journal: 'journal',
  Stats: 'stats',
  Settings: 'settings',
};

const HASH_SEGMENT_TO_PAGE = Object.entries(PAGE_HASH_SEGMENTS).reduce<Record<string, PageKey>>(
  (accumulator, [page, segment]) => {
    accumulator[segment] = page as PageKey;
    return accumulator;
  },
  {},
);

const normalizeNavOrder = (order: readonly string[]): NavItemId[] => {
  const validIds = new Set<NavItemId>(DEFAULT_NAV_ORDER);
  const seen = new Set<NavItemId>();
  const normalized = order.filter((id): id is NavItemId => {
    const nextId = id as NavItemId;
    if (!validIds.has(nextId) || seen.has(nextId)) {
      return false;
    }

    seen.add(nextId);
    return true;
  });

  DEFAULT_NAV_ORDER.forEach((id) => {
    if (!normalized.includes(id)) {
      normalized.push(id);
    }
  });

  return normalized;
};

const loadNavOrder = (): NavItemId[] => {
  if (typeof window === 'undefined') {
    return DEFAULT_NAV_ORDER;
  }

  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NAV_ORDER;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_NAV_ORDER;
    }

    return normalizeNavOrder(parsed);
  } catch {
    return DEFAULT_NAV_ORDER;
  }
};

const loadDataSyncMode = (): DataSyncMode => {
  if (typeof window === 'undefined') {
    return 'cloud';
  }

  return window.localStorage.getItem(DATA_SYNC_MODE_STORAGE_KEY) === 'local' ? 'local' : 'cloud';
};

const isValidDateISO = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseHashRoute = (hash: string): HashRoute => {
  const normalizedHash = hash.replace(/^#\/?/, '').trim();
  const [pathPart, queryString = ''] = normalizedHash.split('?');
  const page =
    HASH_SEGMENT_TO_PAGE[pathPart.toLowerCase()] ??
    (pathPart === '' ? 'Today' : 'Today');

  if (page !== 'Journal') {
    return { page };
  }

  const params = new URLSearchParams(queryString);
  const dateISO = params.get('date')?.trim();

  return {
    page,
    journalDateISO: dateISO && isValidDateISO(dateISO) ? dateISO : undefined,
  };
};

const getCurrentHashRoute = (): HashRoute => {
  if (typeof window === 'undefined') {
    return { page: 'Today' };
  }

  return parseHashRoute(window.location.hash);
};

const buildHashRoute = (page: PageKey, options?: { journalDateISO?: string }) => {
  const segment = PAGE_HASH_SEGMENTS[page];

  if (page === 'Journal' && options?.journalDateISO) {
    return `#/${segment}?date=${encodeURIComponent(options.journalDateISO)}`;
  }

  return `#/${segment}`;
};

const defaultFilters: LibraryFiltersShape = {
  query: '',
  dateFrom: undefined,
  dateTo: undefined,
  starredOnly: false,
  needReviewOnly: false,
};

export default function App() {
  const [entries, setEntries] = useState<StudyEntry[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(() => !isSupabaseConfigured);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [dataSyncMode, setDataSyncMode] = useState<DataSyncMode>(() => loadDataSyncMode());
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>(() => getCurrentHashRoute().page);
  const [todayType, setTodayType] = useState<EntryType>('LeetCode');
  const [filters, setFilters] = useState<LibraryFiltersShape>(defaultFilters);
  const [libraryView, setLibraryView] = useState<LibraryViewMode>('grouped');
  const [librarySort, setLibrarySort] = useState<LibrarySortMode>('date');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => loadJournalEntries());
  const [selectedJournalDateISO, setSelectedJournalDateISO] = useState(
    () => getCurrentHashRoute().journalDateISO ?? todayISO(),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [navOrder, setNavOrder] = useState<NavItemId[]>(() => loadNavOrder());
  const [isEditingNav, setIsEditingNav] = useState(false);
  const [draggingNavId, setDraggingNavId] = useState<NavItemId | null>(null);
  const [dragOverNavId, setDragOverNavId] = useState<NavItemId | null>(null);
  const [navbarOpened, navbarHandlers] = useDisclosure(false);
  const [debouncedQuery] = useDebouncedValue(filters.query, 120);
  const [persistenceMeta, setPersistenceMeta] = useState(() => readPersistenceMeta());
  const [storageMode, setStorageMode] = useState<StorageMode>(() => readPersistenceMeta().storageMode);
  const [fileHandle, setFileHandle] = useState<StoredFileHandle | null>(null);
  const [storageStatus, setStorageStatus] = useState('Using browser localStorage.');
  const [timeSessions, setTimeSessions] = useState<TimeSession[]>(() => loadTimeSessions());
  const [timerCategories, setTimerCategories] = useState<string[]>(() => loadTimerCategories());
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState>(() =>
    loadActiveTimerState(loadTimerCategories()),
  );
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());
  const skipNextCloudPersistRef = useRef(false);

  const fileStorageSupported = supportsFileStorage();
  const canUseCloudSync = Boolean(isSupabaseConfigured && authSession);
  const isCloudMode = canUseCloudSync && dataSyncMode === 'cloud';

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      }

      setAuthSession(data.session ?? null);
      setIsAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      setAuthSession(session);
      setIsAuthReady(true);
      setAuthError('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(DATA_SYNC_MODE_STORAGE_KEY, dataSyncMode);
  }, [dataSyncMode]);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      const meta = readPersistenceMeta();
      let nextEntries = loadEntries();
      let nextJournalEntries = loadJournalEntries();
      let nextMode: StorageMode = meta.storageMode;
      let nextHandle: StoredFileHandle | null = null;
      let nextStatus = 'Using browser localStorage.';
      let nextMeta = meta;

      if (meta.storageMode === 'file') {
        if (!fileStorageSupported) {
          nextMode = 'localStorage';
          nextMeta = updatePersistenceMeta({ storageMode: 'localStorage' });
          nextStatus = 'File storage is unavailable in this browser, so localStorage remains active.';
        } else {
          nextStatus = 'File mode is enabled. Choose the data file to reconnect it.';

          try {
            nextHandle = await loadSavedFileHandle();
          } catch {
            nextHandle = null;
            nextStatus = 'The saved file handle could not be loaded. Choose the data file again.';
          }

          if (nextHandle) {
            try {
              const fileData = await readAppDataFromFile(nextHandle);
              if (fileData === null) {
                await writeAppDataToFile(nextHandle, nextEntries, nextJournalEntries);
                nextStatus = 'Connected to a new local JSON data file.';
              } else {
                nextEntries = fileData.entries;
                nextJournalEntries = fileData.journalEntries;
                nextStatus = 'Using the selected local JSON file for persistence.';
              }
            } catch (error) {
              nextHandle = null;
              nextStatus =
                error instanceof Error
                  ? `${error.message} Using localStorage until the file is reconnected.`
                  : 'The selected data file could not be read. Using localStorage until the file is reconnected.';
            }
          }
        }
      }

      if (!active) {
        return;
      }

      setEntries(nextEntries);
      setJournalEntries(nextJournalEntries);
      setStorageMode(nextMode);
      setFileHandle(nextHandle);
      setStorageStatus(nextStatus);
      setPersistenceMeta(nextMeta);
      setIsReady(true);
    };

    void initialize();

    return () => {
      active = false;
    };
  }, [fileStorageSupported]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!isCloudMode || !authSession) {
      setIsCloudLoading(false);
      return;
    }

    let active = true;
    setIsCloudLoading(true);
    setStorageStatus('Loading your Supabase data...');

    const loadCloudState = async () => {
      try {
        const cloudData = await loadCloudAppData(authSession.user.id);

        if (!active) {
          return;
        }

        skipNextCloudPersistRef.current = true;
        setEntries(cloudData.entries);
        setJournalEntries(cloudData.journalEntries);
        setTimeSessions(cloudData.timeSessions);
        setStorageStatus('Using Supabase cloud sync.');
      } catch (error) {
        if (!active) {
          return;
        }

        setDataSyncMode('local');
        setStorageStatus(
          error instanceof Error
            ? `${error.message} Falling back to local mode.`
            : 'Supabase sync failed. Falling back to local mode.',
        );
      } finally {
        if (active) {
          setIsCloudLoading(false);
        }
      }
    };

    void loadCloudState();

    return () => {
      active = false;
    };
  }, [authSession, isAuthReady, isCloudMode]);

  useEffect(() => {
    if (!isReady || isCloudMode || isCloudLoading) {
      return;
    }

    let active = true;

    const persist = async () => {
      persistLastUsedCodeLanguage(entries);

      if (storageMode === 'file' && fileHandle) {
        try {
          await writeAppDataToFile(fileHandle, entries, journalEntries);
          if (active) {
            setStorageStatus('Using the selected local JSON file for persistence.');
          }
          return;
        } catch {
          saveEntries(entries);
          saveJournalEntries(journalEntries);
          if (active) {
            setStorageStatus('Writing to the data file failed. Changes were also saved to localStorage.');
          }
          return;
        }
      }

      saveEntries(entries);
      saveJournalEntries(journalEntries);

      if (active) {
        setStorageStatus(
          storageMode === 'file'
            ? 'File mode is enabled, but no file is connected yet. Using localStorage for now.'
            : 'Using browser localStorage.',
        );
      }
    };

    void persist();

    return () => {
      active = false;
    };
  }, [entries, fileHandle, isCloudLoading, isCloudMode, isReady, journalEntries, storageMode]);

  useEffect(() => {
    if (!isReady || !isCloudMode || !authSession || isCloudLoading) {
      return;
    }

    if (skipNextCloudPersistRef.current) {
      skipNextCloudPersistRef.current = false;
      return;
    }

    let active = true;

    const persistCloudState = async () => {
      persistLastUsedCodeLanguage(entries);

      try {
        const syncedData = await replaceCloudAppData(authSession.user.id, {
          entries,
          journalEntries,
          timeSessions,
        });

        if (!active) {
          return;
        }

        setStorageStatus('Using Supabase cloud sync.');

        const entryIdsChanged =
          syncedData.entries.length !== entries.length ||
          syncedData.entries.some((entry, index) => entry.id !== entries[index]?.id);
        const sessionIdsChanged =
          syncedData.timeSessions.length !== timeSessions.length ||
          syncedData.timeSessions.some((session, index) => session.id !== timeSessions[index]?.id);

        if (entryIdsChanged) {
          setEntries(syncedData.entries);
        }

        if (sessionIdsChanged) {
          setTimeSessions(syncedData.timeSessions);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setStorageStatus(
          error instanceof Error
            ? `${error.message} Your latest changes remain in memory.`
            : 'Supabase sync failed. Your latest changes remain in memory.',
        );
      }
    };

    void persistCloudState();

    return () => {
      active = false;
    };
  }, [authSession, entries, isCloudLoading, isCloudMode, isReady, journalEntries, timeSessions]);

  useEffect(() => {
    if (editingId && !entries.some((entry) => entry.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, entries]);

  useEffect(() => {
    if (isCloudMode) {
      return;
    }

    saveTimeSessions(timeSessions);
  }, [isCloudMode, timeSessions]);

  useEffect(() => {
    saveTimerCategories(timerCategories);
  }, [timerCategories]);

  useEffect(() => {
    saveActiveTimerState(activeTimer);
  }, [activeTimer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncRouteFromHash = () => {
      const nextRoute = getCurrentHashRoute();
      const normalizedHash = buildHashRoute(nextRoute.page, {
        journalDateISO: nextRoute.page === 'Journal' ? nextRoute.journalDateISO : undefined,
      });

      if (window.location.hash !== normalizedHash) {
        window.history.replaceState(null, '', normalizedHash);
      }

      setActivePage(nextRoute.page);

      if (nextRoute.page === 'Journal' && nextRoute.journalDateISO) {
        setSelectedJournalDateISO(nextRoute.journalDateISO);
      }
    };

    syncRouteFromHash();
    window.addEventListener('hashchange', syncRouteFromHash);

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(normalizeNavOrder(navOrder)));
  }, [navOrder]);

  useEffect(() => {
    setTimerNowMs(Date.now());

    if (!activeTimer.isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeTimer.isRunning]);

  useEffect(() => {
    if (!timerCategories.includes(activeTimer.category) && !activeTimer.isRunning && !activeTimer.isPaused) {
      setActiveTimer((current) => ({
        ...current,
        category: timerCategories[0] ?? TIMER_PRESET_CATEGORIES[0],
      }));
    }
  }, [activeTimer.category, activeTimer.isPaused, activeTimer.isRunning, timerCategories]);

  const companies = useMemo(() => collectCompanies(entries), [entries]);
  const tagOptions = useMemo(() => collectTags(entries), [entries]);
  const orderedNavItems = useMemo(() => {
    const itemLookup = new Map(NAV_ITEMS.map((item) => [item.id, item]));
    return normalizeNavOrder(navOrder)
      .map((id) => itemLookup.get(id))
      .filter((item): item is (typeof NAV_ITEMS)[number] => Boolean(item));
  }, [navOrder]);
  const isDefaultNavOrder = useMemo(
    () => JSON.stringify(normalizeNavOrder(navOrder)) === JSON.stringify(DEFAULT_NAV_ORDER),
    [navOrder],
  );
  const today = todayISO();
  const lastBackupLabel = formatDateTimeLabel(persistenceMeta.lastBackupAt);
  const backupReminderVisible = shouldShowBackupReminder(persistenceMeta);
  const storageBadgeLabel = isCloudMode
    ? 'Cloud sync'
    : storageMode === 'file'
      ? (fileHandle ? 'File mode' : 'File fallback')
      : 'Local';
  const storageSummary = isCloudMode
    ? 'Main data syncs to your Supabase account'
    : storageMode === 'file' && fileHandle
      ? 'Main data is stored in your chosen JSON file'
      : 'Main data is stored in this browser';

  const todayEntries = useMemo(
    () => sortEntries(entries.filter((entry) => entry.dateISO === today && entry.type === todayType)),
    [entries, today, todayType],
  );

  const filteredLibrary = useMemo(
    () =>
      filterEntries(entries, {
        ...filters,
        query: debouncedQuery,
      }),
    [debouncedQuery, entries, filters],
  );

  const groupedLibrary = useMemo(
    () =>
      filteredLibrary.reduce<Record<string, StudyEntry[]>>((accumulator, entry) => {
        accumulator[entry.dateISO] = accumulator[entry.dateISO] ?? [];
        accumulator[entry.dateISO].push(entry);
        return accumulator;
      }, {}),
    [filteredLibrary],
  );
  const libraryTableEntries = useMemo(() => {
    const items = [...filteredLibrary];

    if (librarySort === 'type') {
      items.sort(
        (left, right) =>
          left.type.localeCompare(right.type) ||
          right.dateISO.localeCompare(left.dateISO) ||
          left.title.localeCompare(right.title),
      );
      return items;
    }

    items.sort(
      (left, right) =>
        right.dateISO.localeCompare(left.dateISO) ||
        left.type.localeCompare(right.type) ||
        left.title.localeCompare(right.title),
    );
    return items;
  }, [filteredLibrary, librarySort]);

  const editingEntry = editingId ? entries.find((entry) => entry.id === editingId) ?? null : null;
  const selectedJournalEntry =
    journalEntries.find((entry) => entry.dateISO === selectedJournalDateISO) ?? null;

  const replaceAppData = (
    nextEntries: StudyEntry[],
    nextJournalEntries: JournalEntry[] = [],
    nextTimeSessions: TimeSession[] = timeSessions,
  ) => {
    setEntries(sortEntries(nextEntries));
    setJournalEntries(nextJournalEntries);
    setTimeSessions(sortTimeSessions(nextTimeSessions));
  };

  const handleLogin = async (email: string, password: string) => {
    if (!supabase) {
      setAuthError('Supabase env vars are missing.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setIsAuthSubmitting(false);

    if (error) {
      setAuthError(error.message);
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    if (!supabase) {
      setAuthError('Supabase env vars are missing.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');

    const { error } = await supabase.auth.signUp({ email, password });

    setIsAuthSubmitting(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setStorageStatus('Check your email to confirm the new account, then log in.');
  };

  const handleGoogleLogin = async () => {
    if (!supabase || typeof window === 'undefined') {
      setAuthError('Supabase env vars are missing.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });

    setIsAuthSubmitting(false);

    if (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setDataSyncMode('cloud');
  };

  const handleCloudModeChange = (enabled: boolean) => {
    setDataSyncMode(enabled ? 'cloud' : 'local');
    setStorageStatus(
      enabled
        ? 'Loading your Supabase data...'
        : storageMode === 'file'
          ? 'Cloud sync disabled. Local file mode is active.'
          : 'Cloud sync disabled. Using browser localStorage.',
    );
  };

  const importLocalDataToCloud = () => {
    if (!authSession) {
      return;
    }

    modals.openConfirmModal({
      title: 'Import local data into cloud?',
      centered: true,
      labels: { confirm: 'Import to cloud', cancel: 'Cancel' },
      confirmProps: { color: 'sage' },
      onConfirm: async () => {
        const mergedEntries = mergeEntries(entries, loadExistingLocalEntries());
        const mergedJournalEntries = mergeJournalEntries(journalEntries, loadJournalEntries());
        const mergedTimeSessions = mergeTimeSessions(timeSessions, loadTimeSessions());

        setStorageStatus('Uploading your local data to Supabase...');

        try {
          const syncedData = await replaceCloudAppData(authSession.user.id, {
            entries: mergedEntries,
            journalEntries: mergedJournalEntries,
            timeSessions: mergedTimeSessions,
          });

          skipNextCloudPersistRef.current = true;
          replaceAppData(syncedData.entries, syncedData.journalEntries, syncedData.timeSessions);
          clearLocalEntries();
          clearLocalJournalEntries();
          clearLocalTimeSessions();
          setStorageStatus('Local data was imported into Supabase and then cleared from localStorage.');
        } catch (error) {
          setStorageStatus(
            error instanceof Error
              ? error.message
              : 'Unable to import local data into Supabase right now.',
          );
        }
      },
    });
  };

  const navigateToPage = (page: PageKey, options?: { journalDateISO?: string }) => {
    const nextJournalDateISO =
      page === 'Journal' ? options?.journalDateISO ?? selectedJournalDateISO : undefined;
    const nextHash = buildHashRoute(page, {
      journalDateISO: nextJournalDateISO,
    });

    if (page === 'Journal' && nextJournalDateISO) {
      setSelectedJournalDateISO(nextJournalDateISO);
    }

    setActivePage(page);

    if (typeof window !== 'undefined' && window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  };

  const createEntry = (entry: StudyEntry) => {
    setEntries((current) => sortEntries([entry, ...current]));
    setEditingId(entry.id);
  };

  const saveEntry = (entry: StudyEntry) => {
    setEntries((current) => sortEntries(current.map((item) => (item.id === entry.id ? entry : item))));
    setEditingId(null);
  };

  const openEntryEditor = (entry: StudyEntry) => {
    setEditingId(entry.id);
  };

  const openJournalDate = (dateISO: string) => {
    navigateToPage('Journal', { journalDateISO: dateISO });
    navbarHandlers.close();
  };

  const upsertJournalEntry = (nextEntry: JournalEntry) => {
    const hasContent = Boolean(nextEntry.journal?.trim() || nextEntry.note?.trim() || nextEntry.mood);

    setJournalEntries((current) => {
      if (!hasContent) {
        return current.filter((entry) => entry.dateISO !== nextEntry.dateISO);
      }

      const filtered = current.filter((entry) => entry.dateISO !== nextEntry.dateISO);
      return [{ ...nextEntry, journal: nextEntry.journal ?? '', note: nextEntry.note } as JournalEntry, ...filtered]
        .sort((left, right) => right.dateISO.localeCompare(left.dateISO));
    });
  };

  const clearJournalEntry = (dateISO: string) => {
    setJournalEntries((current) => current.filter((entry) => entry.dateISO !== dateISO));
  };

  const deleteEntry = (entry: StudyEntry) => {
    modals.openConfirmModal({
      title: 'Delete this entry?',
      centered: true,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'danger' },
      onConfirm: () => {
        setEntries((current) => current.filter((item) => item.id !== entry.id));
      },
    });
  };

  const duplicateEntry = (entry: StudyEntry) => {
    const duplicated = duplicateStudyEntry(entry);
    setEntries((current) => sortEntries([duplicated, ...current]));
  };

  const toggleStar = (entry: StudyEntry) => {
    setEntries((current) =>
      sortEntries(current.map((item) => (item.id === entry.id ? { ...item, starred: !item.starred } : item))),
    );
  };

  const handleToggleReview = (entry: StudyEntry) => {
    if (!supportsReview(entry)) {
      return;
    }

    setEntries((current) =>
      sortEntries(current.map((item) => (item.id === entry.id ? toggleReview(item) : item))),
    );
  };

  const exportData = () => {
    const payload = buildExportPayload(entries, journalEntries, timeSessions);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getTimestampedBackupFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const nextMeta = markBackupComplete();
    setPersistenceMeta(nextMeta);
  };

  const dismissReminder = () => {
    const nextMeta = dismissBackupReminder();
    setPersistenceMeta(nextMeta);
  };

  const handleStorageModeChange = (enabled: boolean) => {
    if (!enabled) {
      setStorageMode('localStorage');
      setPersistenceMeta(updatePersistenceMeta({ storageMode: 'localStorage' }));
      setStorageStatus('Using browser localStorage.');
      return;
    }

    if (!fileStorageSupported) {
      setStorageMode('localStorage');
      setPersistenceMeta(updatePersistenceMeta({ storageMode: 'localStorage' }));
      setStorageStatus('File storage is unavailable in this browser, so localStorage remains active.');
      return;
    }

    setStorageMode('file');
    setPersistenceMeta(updatePersistenceMeta({ storageMode: 'file' }));
    setStorageStatus(
      fileHandle
        ? 'Using the selected local JSON file for persistence.'
        : 'File mode is enabled. Choose a data file to finish connecting it.',
    );
  };

  const chooseDataFile = async () => {
    if (!fileStorageSupported) {
      setStorageStatus('File storage is unavailable in this browser, so localStorage remains active.');
      return;
    }

    try {
      const handle = await pickDataFile();
      await saveFileHandle(handle);

      const fileData = await readAppDataFromFile(handle);

      setFileHandle(handle);
      setStorageMode('file');
      setPersistenceMeta(updatePersistenceMeta({ storageMode: 'file' }));

      if (fileData === null) {
        await writeAppDataToFile(handle, entries, journalEntries);
        setStorageStatus('Connected to a new local JSON data file.');
        return;
      }

      setEntries(fileData.entries);
      setJournalEntries(fileData.journalEntries);
      setStorageStatus(`Loaded ${fileData.entries.length} entries from the selected data file.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setStorageStatus(
        error instanceof Error ? error.message : 'The data file could not be connected.',
      );
    }
  };

  const importMerge = (raw: string) => {
    const incoming = parseImportBundle(raw);
    setEntries((current) => mergeEntries(current, incoming.entries));
    setJournalEntries((current) => mergeJournalEntries(current, incoming.journalEntries));
    setTimeSessions((current) => mergeTimeSessions(current, incoming.timeSessions ?? []));
  };

  const importReplace = (raw: string) => {
    const incoming = parseImportBundle(raw);
    modals.openConfirmModal({
      title: 'Replace all current study data?',
      centered: true,
      labels: { confirm: 'Replace', cancel: 'Cancel' },
      confirmProps: { color: 'danger' },
      onConfirm: () => replaceAppData(incoming.entries, incoming.journalEntries, incoming.timeSessions ?? []),
    });
  };

  const clearAllData = () => {
    modals.openConfirmModal({
      title: 'Clear all study data?',
      centered: true,
      labels: { confirm: 'Clear', cancel: 'Cancel' },
      confirmProps: { color: 'danger' },
      onConfirm: () => replaceAppData([], [], []),
    });
  };

  const reorderNavItem = (draggedId: NavItemId, targetId: NavItemId) => {
    setNavOrder((current) => {
      const normalized = normalizeNavOrder(current);
      const fromIndex = normalized.indexOf(draggedId);
      const targetIndex = normalized.indexOf(targetId);

      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
        return normalized;
      }

      const next = [...normalized];
      const [moved] = next.splice(fromIndex, 1);
      const insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  };

  const resetNavOrder = () => {
    setNavOrder([...DEFAULT_NAV_ORDER]);
  };

  const appendTimeSession = (session: TimeSession) => {
    setTimeSessions((current) => sortTimeSessions([session, ...current]));
  };

  const addTimerCategory = (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }

    setTimerCategories((current) => ensureTimerCategories([...current, nextName]));
  };

  const renameTimerCategory = (previousName: string, nextName: string) => {
    const trimmedNext = nextName.trim();
    if (!trimmedNext || previousName === trimmedNext || (TIMER_PRESET_CATEGORIES as readonly string[]).includes(previousName)) {
      return;
    }

    setTimerCategories((current) =>
      ensureTimerCategories(current.map((item) => (item === previousName ? trimmedNext : item))),
    );
    setTimeSessions((current) =>
      current.map((session) => (session.category === previousName ? { ...session, category: trimmedNext } : session)),
    );
    setActiveTimer((current) =>
      current.category === previousName && !current.isRunning && !current.isPaused
        ? { ...current, category: trimmedNext }
        : current,
    );
  };

  const deleteTimerCategory = (name: string) => {
    if ((TIMER_PRESET_CATEGORIES as readonly string[]).includes(name)) {
      return;
    }

    setTimerCategories((current) => ensureTimerCategories(current.filter((item) => item !== name)));
    setActiveTimer((current) =>
      current.category === name && !current.isRunning && !current.isPaused
        ? {
            ...current,
            category: TIMER_PRESET_CATEGORIES[0],
          }
        : current,
    );
  };

  const renderBackupBanner = () =>
    backupReminderVisible ? (
      <BackupReminder lastBackupLabel={lastBackupLabel} onQuickExport={exportData} onDismiss={dismissReminder} />
    ) : null;

  const renderLoadingState = () => (
    <Card withBorder radius="lg" shadow="sm" className="section-card">
      <Text size="sm" c="dimmed">
        Loading saved study data...
      </Text>
    </Card>
  );

  const renderTodayPage = () => (
    <Stack spacing="md" className="page-stack">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Group position="apart" align="center">
          <div>
            <Title order={2}>Today</Title>
            <Text size="sm" c="dimmed">
              Switch the entry type, capture the session quickly, and keep today&apos;s work visible.
            </Text>
          </div>

          <Group spacing="sm">
            <Button variant="light" onClick={exportData}>
              Quick Export
            </Button>
            <SegmentedControl
              value={todayType}
              onChange={(value) => setTodayType(value as EntryType)}
              data={ENTRY_TYPES.map((value) => ({ value, label: value }))}
            />
          </Group>
        </Group>
      </Card>

      {renderBackupBanner()}

      {isReady ? (
        <>
          <QuickAddCard
            entryType={todayType}
            companies={companies}
            tagOptions={tagOptions}
            onCreate={createEntry}
          />

          <Stack spacing="sm">
            <Group position="apart">
              <Text fw={700}>Today&apos;s {todayType} entries</Text>
              <Badge color="sage" variant="light">
                {todayEntries.length}
              </Badge>
            </Group>

            {todayEntries.length > 0 ? (
              todayEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  openOnCardClick
                  onOpen={(item) => setEditingId(item.id)}
                  onEdit={(item) => setEditingId(item.id)}
                  onDelete={deleteEntry}
                  onDuplicate={duplicateEntry}
                  onToggleStar={toggleStar}
                  onToggleReview={handleToggleReview}
                />
              ))
            ) : (
              <Card withBorder radius="lg" shadow="sm" className="section-card">
                <Text size="sm" c="dimmed">
                  No entries yet for this type today. Add one above to seed the list.
                </Text>
              </Card>
            )}
          </Stack>
        </>
      ) : (
        renderLoadingState()
      )}
    </Stack>
  );

  const renderLibraryPage = () => (
    <Stack spacing="md" className="page-stack">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Group position="apart" align="flex-end">
          <div>
            <Title order={2}>Library</Title>
            <Text size="sm" c="dimmed" mt={4}>
              Search across titles, blocks, tags, and follow-up answers. Click any row or card to edit it.
            </Text>
          </div>

          <Group spacing="sm" align="flex-end">
            <SegmentedControl
              value={libraryView}
              onChange={(value) => setLibraryView(value as LibraryViewMode)}
              data={[
                { value: 'grouped', label: 'Grouped' },
                { value: 'table', label: 'Table' },
              ]}
            />
            {libraryView === 'table' ? (
              <SegmentedControl
                value={librarySort}
                onChange={(value) => setLibrarySort(value as LibrarySortMode)}
                data={[
                  { value: 'date', label: 'Date' },
                  { value: 'type', label: 'Type' },
                ]}
              />
            ) : null}
          </Group>
        </Group>
      </Card>

      {isReady ? (
        <>
          <LibraryFilters filters={filters} companies={companies} onChange={setFilters} />

          {filteredLibrary.length > 0 ? (
            libraryView === 'grouped' ? (
              <Accordion variant="separated" radius="lg">
                {Object.keys(groupedLibrary)
                  .sort((left, right) => right.localeCompare(left))
                  .map((dateISO) => (
                    <Accordion.Item key={dateISO} value={dateISO}>
                    <Accordion.Control>
                      <Group position="apart" pr="md">
                        <Text fw={600}>{formatDateLabel(dateISO)}</Text>
                        <Group spacing="xs">
                          {hasJournalText(journalEntries.find((entry) => entry.dateISO === dateISO)) ? (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={(event) => {
                                event.stopPropagation();
                                openJournalDate(dateISO);
                              }}
                            >
                              📝
                            </Button>
                          ) : null}
                          <Badge color="sage" variant="light">
                            {groupedLibrary[dateISO].length}
                          </Badge>
                        </Group>
                      </Group>
                    </Accordion.Control>
                      <Accordion.Panel>
                        <Stack spacing="sm">
                          {groupedLibrary[dateISO].map((entry) => (
                            <EntryCard
                              key={entry.id}
                              entry={entry}
                              openOnCardClick
                              onOpen={openEntryEditor}
                              onEdit={openEntryEditor}
                              onDelete={deleteEntry}
                              onDuplicate={duplicateEntry}
                              onToggleStar={toggleStar}
                              onToggleReview={handleToggleReview}
                            />
                          ))}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
              </Accordion>
            ) : (
              <Card withBorder radius="lg" shadow="sm" className="section-card library-table-card">
                <ScrollArea>
                  <Table
                    highlightOnHover
                    horizontalSpacing="md"
                    verticalSpacing="sm"
                    className="library-table"
                  >
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Flags</th>
                        <th>Tags</th>
                        <th>Company</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {libraryTableEntries.map((entry) => {
                        const tags = getEntryTags(entry);

                        return (
                          <tr
                            key={entry.id}
                            className="library-table-row"
                            onClick={() => openEntryEditor(entry)}
                          >
                            <td>
                              <Text size="sm">{entry.dateISO}</Text>
                            </td>
                            <td>
                              <Badge size="sm" color="sage" variant="light">
                                {entry.type}
                              </Badge>
                            </td>
                            <td>
                              {entry.link ? (
                                <Anchor
                                  href={entry.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {entry.title}
                                </Anchor>
                              ) : (
                                <Text size="sm" fw={600}>
                                  {entry.title}
                                </Text>
                              )}
                            </td>
                            <td>
                              <Group spacing={6}>
                                {entry.starred ? <Text size="sm">⭐</Text> : null}
                                {entry.type === 'LeetCode' && entry.needReview ? <Text size="sm">🔁</Text> : null}
                              </Group>
                            </td>
                            <td>
                              <Group spacing={4}>
                                {tags.slice(0, 3).map((tag) => (
                                  <Badge key={`${entry.id}-${tag}`} size="xs" color="sage" variant="light">
                                    {tag}
                                  </Badge>
                                ))}
                                {tags.length > 3 ? (
                                  <Badge size="xs" color="gray" variant="light">
                                    +{tags.length - 3}
                                  </Badge>
                                ) : null}
                              </Group>
                            </td>
                            <td>
                              <Text size="sm">
                                {entry.type === 'InterviewPrep' ? entry.company || ' ' : ' '}
                              </Text>
                            </td>
                            <td>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEntryEditor(entry);
                                }}
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </ScrollArea>
              </Card>
            )
          ) : (
            <Card withBorder radius="lg" shadow="sm" className="section-card">
              <Text size="sm" c="dimmed">
                No entries match the current library filters.
              </Text>
            </Card>
          )}
        </>
      ) : (
        renderLoadingState()
      )}
    </Stack>
  );

  const renderFocusPage = () => (
    <Stack spacing="md" className="page-stack focus-page">
      <Card withBorder radius="lg" shadow="sm" className="section-card focus-page-intro">
        <Title order={2}>Focus</Title>
        <Text size="sm" c="dimmed" mt={4}>
          Run a dedicated focus session, keep today&apos;s category totals visible, and review the daily timeline.
        </Text>
      </Card>

      <FocusPanel
        activeTimer={activeTimer}
        currentTimeMs={timerNowMs}
        categories={timerCategories}
        timeSessions={timeSessions}
        onTimerChange={setActiveTimer}
        onAddCategory={addTimerCategory}
        onSessionComplete={appendTimeSession}
      />
    </Stack>
  );

  const renderJournalPage = () => (
    <JournalPanel
      selectedDateISO={selectedJournalDateISO}
      entry={selectedJournalEntry}
      onSelectDate={(dateISO) => navigateToPage('Journal', { journalDateISO: dateISO })}
      onChange={upsertJournalEntry}
      onClear={clearJournalEntry}
    />
  );

  const renderStatsPage = () => (
    <Stack spacing="md" className="page-stack">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Title order={2}>Stats</Title>
        <Text size="sm" c="dimmed" mt={4}>
          A clean snapshot of pace, coverage, and review load.
        </Text>
      </Card>
      {isReady ? <StatsPanel entries={entries} timeSessions={timeSessions} /> : renderLoadingState()}
    </Stack>
  );

  const renderSettingsPage = () => (
    <Stack spacing="md" className="page-stack">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Title order={2}>Settings</Title>
        <Text size="sm" c="dimmed" mt={4}>
          Manage backups, optional file storage, imports, and destructive maintenance actions.
        </Text>
      </Card>

      {renderBackupBanner()}

      {isReady ? (
        <SettingsPanel
          entryCount={entries.length}
          cloudAvailable={isSupabaseConfigured}
          canUseCloud={canUseCloudSync}
          cloudModeEnabled={isCloudMode}
          cloudStatus={storageStatus}
          authEmail={authSession?.user.email}
          storageMode={storageMode}
          fileStorageSupported={fileStorageSupported}
          hasConnectedFile={Boolean(fileHandle)}
          storageStatus={storageStatus}
          lastBackupLabel={lastBackupLabel}
          timerCategories={timerCategories}
          onQuickExport={exportData}
          onCloudModeChange={handleCloudModeChange}
          onImportLocalToCloud={importLocalDataToCloud}
          onLogout={() => void handleLogout()}
          onChooseDataFile={chooseDataFile}
          onStorageModeChange={handleStorageModeChange}
          onImportMerge={importMerge}
          onImportReplace={importReplace}
          onRenameTimerCategory={renameTimerCategory}
          onDeleteTimerCategory={deleteTimerCategory}
          onClear={clearAllData}
        />
      ) : (
        renderLoadingState()
      )}
    </Stack>
  );

  const renderActivePage = () => {
    if (activePage === 'Today') {
      return renderTodayPage();
    }

    if (activePage === 'Library') {
      return renderLibraryPage();
    }

    if (activePage === 'Focus') {
      return renderFocusPage();
    }

    if (activePage === 'Journal') {
      return renderJournalPage();
    }

    if (activePage === 'Stats') {
      return renderStatsPage();
    }

    return renderSettingsPage();
  };

  if (isSupabaseConfigured && !isAuthReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <Card withBorder radius="xl" shadow="sm" className="section-card">
          <Text size="sm" c="dimmed">
            Connecting to Supabase...
          </Text>
        </Card>
      </div>
    );
  }

  if (isSupabaseConfigured && !authSession) {
    return (
      <AuthScreen
        isLoading={isAuthSubmitting}
        isSupabaseConfigured={isSupabaseConfigured}
        authError={authError}
        onLogin={handleLogin}
        onSignUp={handleSignUp}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <>
      <AppShell
        padding="sm"
        navbarOffsetBreakpoint="sm"
        className="app-shell"
        navbar={
          <Navbar
            p="sm"
            width={{ sm: 280, lg: 300 }}
            hiddenBreakpoint="sm"
            hidden={!navbarOpened}
            className="nav-card"
          >
            <Navbar.Section>
              <Stack spacing={4}>
                <Text fw={400} fz={15} lh={1.4} c="dimmed">
                  Track LeetCode, system design, and company-specific interview practice in one place.
                </Text>
              </Stack>
            </Navbar.Section>

            <Navbar.Section grow mt="lg" component={ScrollArea}>
              <Stack spacing="xs">
                <Group position="apart" align="center" mb={4}>
                  <Button
                    size="xs"
                    variant={isEditingNav ? 'filled' : 'subtle'}
                    color="sage"
                    onClick={() => setIsEditingNav((current) => !current)}
                  >
                    {isEditingNav ? 'Done' : 'Edit'}
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={resetNavOrder}
                    disabled={isDefaultNavOrder}
                  >
                    Reset order
                  </Button>
                </Group>

                {isEditingNav ? (
                  <Text size="xs" c="dimmed">
                    Drag items to reorder them.
                  </Text>
                ) : null}

                {orderedNavItems.map((item) => {
                  const isDragging = draggingNavId === item.id;
                  const isDropTarget = dragOverNavId === item.id && draggingNavId !== item.id;

                  return (
                    <div
                      key={item.id}
                      draggable={isEditingNav}
                      onDragStart={(event) => {
                        if (!isEditingNav) {
                          return;
                        }

                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingNavId(item.id);
                        setDragOverNavId(item.id);
                      }}
                      onDragOver={(event) => {
                        if (!isEditingNav || !draggingNavId || draggingNavId === item.id) {
                          return;
                        }

                        event.preventDefault();
                        if (dragOverNavId !== item.id) {
                          setDragOverNavId(item.id);
                        }
                      }}
                      onDrop={(event) => {
                        if (!isEditingNav || !draggingNavId) {
                          return;
                        }

                        event.preventDefault();
                        reorderNavItem(draggingNavId, item.id);
                        setDraggingNavId(null);
                        setDragOverNavId(null);
                      }}
                      onDragEnd={() => {
                        setDraggingNavId(null);
                        setDragOverNavId(null);
                      }}
                      style={{
                        borderRadius: 12,
                        outline: isDropTarget ? '1px dashed var(--mantine-color-sage-4)' : '1px solid transparent',
                        outlineOffset: 2,
                        opacity: isDragging ? 0.6 : 1,
                        transition: 'opacity 120ms ease, outline-color 120ms ease',
                      }}
                    >
                    <NavLink
                      style={{ cursor: isEditingNav ? 'grab' : 'pointer' }}
                      label={
                        <Group spacing="xs" align="center" noWrap>
                          <Text span style={{ width: 18, textAlign: 'center', lineHeight: 1 }}>
                            {item.icon}
                          </Text>
                          <Text span>{item.label}</Text>
                        </Group>
                      }
                      active={activePage === item.key}
                      onClick={() => {
                        if (isEditingNav) {
                          return;
                        }

                        navigateToPage(item.key);
                        navbarHandlers.close();
                      }}
                    />
                    </div>
                  );
                })}
              </Stack>
            </Navbar.Section>

            <Navbar.Section>
              <Card withBorder radius="md" className="section-card">
                <Text size="sm" c="dimmed">
                  {entries.length} total entries
                </Text>
                <Text fw={600}>{storageSummary}</Text>
                {authSession ? (
                  <Button mt="sm" size="xs" variant="subtle" color="gray" onClick={() => void handleLogout()}>
                    Log out
                  </Button>
                ) : null}
              </Card>
            </Navbar.Section>
          </Navbar>
        }
        header={
          <Header height={60} p="sm" className="nav-card">
            <Group position="apart" align="center" style={{ height: '100%' }}>
              <Group align="center">
                <MediaQuery largerThan="sm" styles={{ display: 'none' }}>
                  <Burger opened={navbarOpened} onClick={navbarHandlers.toggle} size="sm" mr="xl" />
                </MediaQuery>
                <div>
                  <Text size="sm" fw={700} c="dimmed">
                    GoodGoodStudy
                  </Text>
                  <Text fw={400}>{activePage}</Text>
                </div>
              </Group>

              <Badge color="sage" variant="light">
                {storageBadgeLabel}
              </Badge>
            </Group>
          </Header>
        }
      >
        {renderActivePage()}
      </AppShell>
      <EntryDrawer
        entry={editingEntry}
        opened={Boolean(editingEntry)}
        companies={companies}
        tagOptions={tagOptions}
        onClose={() => setEditingId(null)}
        onSave={saveEntry}
      />
    </>
  );
}
