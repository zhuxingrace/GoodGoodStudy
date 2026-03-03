import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Notification,
  NumberInput,
  Radio,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  FOCUS_SESSION_TYPES,
  getDisplayRemainingSeconds,
  getPhaseDurationSeconds,
  loadLastFocusSessionType,
  resetTimerState,
  saveLastFocusSessionType,
  saveActiveTimerState,
  type FocusSessionType,
  type ActiveTimerState,
  type TimeSession,
} from '../lib/timeTracker';
import { todayISO } from '../lib/studyData';

interface FocusPanelProps {
  activeTimer: ActiveTimerState;
  currentTimeMs: number;
  categories: string[];
  timeSessions: TimeSession[];
  onTimerChange: (next: ActiveTimerState) => void;
  onAddCategory: (name: string) => void;
  onSessionComplete: (session: TimeSession) => void;
}

const FOCUS_RING_RADIUS = 138;
const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * FOCUS_RING_RADIUS;
const CATEGORY_COLORS = ['#7BC4B8', '#94D2C9', '#B8E3DB', '#D2EEE9', '#A8DDD5', '#C2E8E2', '#DDF2EE', '#C9D4D1'];
const FOCUS_SOUND_ENABLED_KEY = 'study-tracker-focus-sound-enabled';
const FOCUS_SOUND_PROFILE_KEY = 'study-tracker-focus-sound-profile';
const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 180;
const FOCUS_PRIMARY_TEAL = '#7BC4B8';
const FOCUS_PRIMARY_TEAL_DARK = '#5FAFA3';
const FOCUS_BREAK_TINT = '#B8E3DB';
const FOCUS_BREAK_TINT_DARK = '#87CCC0';
const SOUND_PROFILE_OPTIONS = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'bell', label: 'Bell' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
] as const;

type AudioContextConstructor = typeof AudioContext;
type FocusSoundProfile = (typeof SOUND_PROFILE_OPTIONS)[number]['value'];
type ToneStep = {
  delay: number;
  duration: number;
  frequency: number;
  gain: number;
  type?: OscillatorType;
};

const getAudioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
};

const loadSoundEnabled = () => {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(FOCUS_SOUND_ENABLED_KEY) !== 'false';
};

const loadSoundProfile = (): FocusSoundProfile => {
  if (typeof window === 'undefined') {
    return 'bell';
  }

  const saved = window.localStorage.getItem(FOCUS_SOUND_PROFILE_KEY);
  if (saved === 'subtle' || saved === 'bell' || saved === 'chime' || saved === 'alarm') {
    return saved;
  }

  return 'bell';
};

const getSoundPattern = (profile: FocusSoundProfile, phase: 'focus' | 'break'): ToneStep[] => {
  if (profile === 'subtle') {
    return phase === 'focus'
      ? [
          { delay: 0, duration: 0.16, frequency: 880, gain: 0.14, type: 'sine' },
          { delay: 0.2, duration: 0.18, frequency: 1174, gain: 0.12, type: 'sine' },
        ]
      : [{ delay: 0, duration: 0.22, frequency: 740, gain: 0.12, type: 'sine' }];
  }

  if (profile === 'bell') {
    return phase === 'focus'
      ? [
          { delay: 0, duration: 0.34, frequency: 1046, gain: 0.28, type: 'triangle' },
          { delay: 0.24, duration: 0.34, frequency: 1318, gain: 0.22, type: 'triangle' },
        ]
      : [
          { delay: 0, duration: 0.28, frequency: 784, gain: 0.22, type: 'triangle' },
          { delay: 0.22, duration: 0.28, frequency: 988, gain: 0.18, type: 'triangle' },
        ];
  }

  if (profile === 'chime') {
    return phase === 'focus'
      ? [
          { delay: 0, duration: 0.22, frequency: 784, gain: 0.24, type: 'sine' },
          { delay: 0.16, duration: 0.24, frequency: 988, gain: 0.22, type: 'sine' },
          { delay: 0.32, duration: 0.28, frequency: 1318, gain: 0.2, type: 'sine' },
        ]
      : [
          { delay: 0, duration: 0.18, frequency: 659, gain: 0.2, type: 'sine' },
          { delay: 0.14, duration: 0.18, frequency: 784, gain: 0.18, type: 'sine' },
        ];
  }

  return phase === 'focus'
    ? [
        { delay: 0, duration: 0.14, frequency: 988, gain: 0.3, type: 'square' },
        { delay: 0.18, duration: 0.14, frequency: 988, gain: 0.28, type: 'square' },
        { delay: 0.36, duration: 0.18, frequency: 1318, gain: 0.26, type: 'square' },
      ]
    : [
        { delay: 0, duration: 0.18, frequency: 698, gain: 0.24, type: 'square' },
        { delay: 0.22, duration: 0.18, frequency: 698, gain: 0.22, type: 'square' },
      ];
};

const clampCustomMinutes = (value: number) => Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, value));

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const formatFocusMinutes = (minutes: number) => {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  if (totalSeconds <= 0) {
    return '0m';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const remainderSeconds = totalSeconds % 3600;
  const displayMinutes = Math.floor(remainderSeconds / 60);
  const displaySeconds = remainderSeconds % 60;

  if (hours === 0) {
    if (displayMinutes === 0) {
      return `${displaySeconds}s`;
    }

    if (displaySeconds === 0) {
      return `${displayMinutes}m`;
    }

    return `${displayMinutes}m ${displaySeconds}s`;
  }

  if (displayMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${displayMinutes}m`;
};

const formatTimeLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const getInitialDurationMode = (focusMinutes: number, breakMinutes: number) => {
  if (focusMinutes === 25 && breakMinutes === 5) {
    return '25-5' as const;
  }

  if (focusMinutes === 50 && breakMinutes === 10) {
    return '50-10' as const;
  }

  return 'custom' as const;
};

export default function FocusPanel({
  activeTimer,
  currentTimeMs,
  categories,
  timeSessions,
  onTimerChange,
  onAddCategory,
  onSessionComplete,
}: FocusPanelProps) {
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [durationMode, setDurationMode] = useState<'25-5' | '50-10' | 'custom'>(() =>
    getInitialDurationMode(activeTimer.focusMinutes, activeTimer.breakMinutes),
  );
  const [customFocusMinutes, setCustomFocusMinutes] = useState(() => clampCustomMinutes(activeTimer.focusMinutes));
  const [customBreakMinutes, setCustomBreakMinutes] = useState(() => clampCustomMinutes(activeTimer.breakMinutes));
  const [selectedSessionType, setSelectedSessionType] = useState<FocusSessionType>(() => loadLastFocusSessionType());
  const [toastMessage, setToastMessage] = useState('');
  const [startError, setStartError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => loadSoundEnabled());
  const [soundProfile, setSoundProfile] = useState<FocusSoundProfile>(() => loadSoundProfile());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    return window.Notification.permission;
  });
  const completedPhaseRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(''), 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toastMessage]);

  useEffect(() => {
    saveLastFocusSessionType(selectedSessionType);
  }, [selectedSessionType]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FOCUS_SOUND_ENABLED_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FOCUS_SOUND_PROFILE_KEY, soundProfile);
  }, [soundProfile]);

  useEffect(() => {
    return () => {
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      if (audioContext) {
        void audioContext.close();
      }
    };
  }, []);

  useEffect(() => {
    if (activeTimer.isRunning || activeTimer.isPaused) {
      return;
    }

    if (durationMode === 'custom') {
      setCustomFocusMinutes(clampCustomMinutes(activeTimer.focusMinutes));
      setCustomBreakMinutes(clampCustomMinutes(activeTimer.breakMinutes));
      return;
    }

    const nextMode = getInitialDurationMode(activeTimer.focusMinutes, activeTimer.breakMinutes);
    setDurationMode(nextMode);
    if (nextMode === 'custom') {
      setCustomFocusMinutes(clampCustomMinutes(activeTimer.focusMinutes));
      setCustomBreakMinutes(clampCustomMinutes(activeTimer.breakMinutes));
    }
  }, [activeTimer.breakMinutes, activeTimer.focusMinutes, activeTimer.isPaused, activeTimer.isRunning, durationMode]);

  const remainingSeconds = useMemo(
    () => getDisplayRemainingSeconds(activeTimer, currentTimeMs),
    [activeTimer, currentTimeMs],
  );
  const phaseDurationSeconds = useMemo(() => Math.max(1, getPhaseDurationSeconds(activeTimer)), [activeTimer]);
  const preciseRemainingSeconds = useMemo(() => {
    if (activeTimer.isRunning && typeof activeTimer.startedAtMs === 'number') {
      const elapsedMs = Math.max(0, currentTimeMs - activeTimer.startedAtMs);
      return Math.max(0, activeTimer.durationSeconds - elapsedMs / 1000);
    }

    return remainingSeconds;
  }, [activeTimer, currentTimeMs, remainingSeconds]);
  const progressValue = useMemo(
    () => Math.max(0, Math.min(100, ((phaseDurationSeconds - preciseRemainingSeconds) / phaseDurationSeconds) * 100)),
    [phaseDurationSeconds, preciseRemainingSeconds],
  );
  const remainingRatio = useMemo(
    () => Math.max(0, Math.min(1, preciseRemainingSeconds / phaseDurationSeconds)),
    [phaseDurationSeconds, preciseRemainingSeconds],
  );

  const isIdle = !activeTimer.isRunning && !activeTimer.isPaused;
  const today = todayISO(new Date(currentTimeMs));
  const todayFocusSessions = useMemo(
    () =>
      timeSessions
        .filter((session) => session.mode === 'focus' && todayISO(new Date(session.endAtISO)) === today)
        .sort((left, right) => left.startAtISO.localeCompare(right.startAtISO)),
    [timeSessions, today],
  );

  const activeFocusSession = useMemo(() => {
    if (activeTimer.mode !== 'focus' || (!activeTimer.isRunning && !activeTimer.isPaused)) {
      return null;
    }

    const startedAtMs = activeTimer.phaseStartedAtMs ?? activeTimer.startedAtMs;
    if (typeof startedAtMs !== 'number') {
      return null;
    }

    const startAtISO = new Date(startedAtMs).toISOString();
    if (todayISO(new Date(startedAtMs)) !== today) {
      return null;
    }

    const elapsedSeconds = Math.max(0, phaseDurationSeconds - preciseRemainingSeconds);
    const elapsedMinutes = elapsedSeconds / 60;
    const effectiveEndMs = startedAtMs + elapsedSeconds * 1000;

    return {
      id: 'focus-active-session',
      category: activeTimer.category,
      startAtISO,
      endAtISO: new Date(effectiveEndMs).toISOString(),
      elapsedSeconds,
      elapsedMinutes,
      statusLabel: activeTimer.isRunning ? 'In progress' : 'Paused',
    };
  }, [activeTimer, phaseDurationSeconds, preciseRemainingSeconds, today]);

  const allCategories = useMemo(() => {
    const categorySet = new Set(categories);
    todayFocusSessions.forEach((session) => categorySet.add(session.category));
    if (activeFocusSession) {
      categorySet.add(activeFocusSession.category);
    }
    return Array.from(categorySet);
  }, [activeFocusSession, categories, todayFocusSessions]);

  const categoryStats = useMemo(
    () =>
      allCategories.map((category) => {
        const sessions = todayFocusSessions.filter((session) => session.category === category);
        const completedMinutes = sessions.reduce((total, session) => total + session.minutes, 0);
        const activeMinutes = activeFocusSession?.category === category ? activeFocusSession.elapsedMinutes : 0;

        return {
          category,
          count: sessions.length,
          minutes: completedMinutes + activeMinutes,
        };
      }),
    [activeFocusSession, allCategories, todayFocusSessions],
  );

  const totalFocusMinutes =
    todayFocusSessions.reduce((total, session) => total + session.minutes, 0) +
    (activeFocusSession?.elapsedMinutes ?? 0);
  const recentSessions = [...todayFocusSessions]
    .sort((left, right) => right.endAtISO.localeCompare(left.endAtISO))
    .slice(0, 5);

  const colorByCategory = useMemo(
    () =>
      allCategories.reduce<Record<string, string>>((accumulator, category, index) => {
        accumulator[category] = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
        return accumulator;
      }, {}),
    [allCategories],
  );

  const timelineSegments = useMemo(
    () => {
      const completedSegments = todayFocusSessions.map((session) => {
        const start = new Date(session.startAtISO);
        const end = new Date(session.endAtISO);
        const startMinutes = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
        const endMinutes = end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60;
        const leftPercent = (startMinutes / 1440) * 100;
        const widthPercent = Math.max(0.8, ((Math.max(endMinutes, startMinutes + 1) - startMinutes) / 1440) * 100);

        return {
          id: session.id,
          category: session.category,
          leftPercent,
          widthPercent,
          color: colorByCategory[session.category] ?? CATEGORY_COLORS[0],
          isActive: false,
        };
      });

      if (!activeFocusSession) {
        return completedSegments;
      }

      const start = new Date(activeFocusSession.startAtISO);
      const end = new Date(activeFocusSession.endAtISO);
      const startMinutes = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
      const endMinutes = end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60;

      return [
        ...completedSegments,
        {
          id: activeFocusSession.id,
          category: activeFocusSession.category,
          leftPercent: (startMinutes / 1440) * 100,
          widthPercent: Math.max(0.8, ((Math.max(endMinutes, startMinutes + 1 / 60) - startMinutes) / 1440) * 100),
          color: colorByCategory[activeFocusSession.category] ?? CATEGORY_COLORS[0],
          isActive: true,
        },
      ];
    },
    [activeFocusSession, colorByCategory, todayFocusSessions],
  );

  const setCategory = (category: string) => {
    if (activeTimer.isRunning || activeTimer.isPaused) {
      return;
    }

    setStartError('');
    onTimerChange({
      ...activeTimer,
      category,
    });
  };

  const updateDurations = (focusMinutes: number, breakMinutes: number) => {
    if (activeTimer.isRunning || activeTimer.isPaused) {
      return;
    }

    const nextSeconds = activeTimer.mode === 'focus' ? focusMinutes * 60 : breakMinutes * 60;

    onTimerChange({
      ...activeTimer,
      focusMinutes,
      breakMinutes,
      durationSeconds: nextSeconds,
      phaseTotalSeconds: nextSeconds,
      pausedRemainingSeconds: nextSeconds,
    });
  };

  const prepareAudioContext = async () => {
    if (!soundEnabled) {
      return null;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {
        return audioContextRef.current;
      }
    }

    return audioContextRef.current;
  };

  const playCompletionSound = async (phase: 'focus' | 'break', profileOverride?: FocusSoundProfile) => {
    if (!soundEnabled) {
      return;
    }

    const audioContext = await prepareAudioContext();
    if (!audioContext) {
      return;
    }

    const now = audioContext.currentTime;
    const pattern = getSoundPattern(profileOverride ?? soundProfile, phase);

    pattern.forEach((step) => {
      const startAt = now + step.delay;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = step.type ?? 'sine';
      oscillator.frequency.value = step.frequency;
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(step.gain, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + step.duration);
    });
  };

  const previewSound = (profileOverride?: FocusSoundProfile) => {
    const nextProfile = profileOverride ?? soundProfile;
    void playCompletionSound(activeTimer.mode === 'break' ? 'break' : 'focus', nextProfile);
    setToastMessage(`Previewing ${SOUND_PROFILE_OPTIONS.find((option) => option.value === nextProfile)?.label ?? 'sound'}`);
  };

  const toggleSoundEnabled = () => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    if (nextValue) {
      void prepareAudioContext();
    }
    setToastMessage(nextValue ? 'Timer sound enabled' : 'Timer sound muted');
  };

  const showPhaseNotification = (message: string) => {
    setToastMessage(message);

    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
      void new window.Notification(message);
    }
  };

  const enableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      setToastMessage('Browser notifications are not supported here.');
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    setToastMessage(
      permission === 'granted'
        ? 'Browser notifications enabled'
        : 'Browser notifications remain disabled',
    );
  };

  const completeFocusPhase = () => {
    const endedAtMs = Date.now();
    const startedAtMs = activeTimer.phaseStartedAtMs ?? endedAtMs - activeTimer.phaseTotalSeconds * 1000;
    const completedMinutes = Math.max(1, Math.round(activeTimer.phaseTotalSeconds / 60));
    const nextBreakSeconds = activeTimer.breakMinutes * 60;

    onSessionComplete({
      id: `session-${endedAtMs}`,
      category: activeTimer.category,
      type: selectedSessionType,
      mode: 'focus',
      dateISO: todayISO(new Date(endedAtMs)),
      minutes: completedMinutes,
      startAtISO: new Date(startedAtMs).toISOString(),
      endAtISO: new Date(endedAtMs).toISOString(),
      durationMinutes: completedMinutes,
    });

    const nextTimer: ActiveTimerState = {
      ...activeTimer,
      isRunning: true,
      isPaused: false,
      mode: 'break',
      startedAtMs: endedAtMs,
      phaseStartedAtMs: endedAtMs,
      durationSeconds: nextBreakSeconds,
      phaseTotalSeconds: nextBreakSeconds,
      pausedRemainingSeconds: undefined,
      lastCompletedAtISO: new Date(endedAtMs).toISOString(),
    };

    saveActiveTimerState(nextTimer);
    onTimerChange(nextTimer);
    void playCompletionSound('focus');
    showPhaseNotification('Focus complete — break starts now');
  };

  const completeBreakPhase = () => {
    const completedAtMs = Date.now();
    const nextFocusMinutes = durationMode === 'custom' ? customFocusMinutes : activeTimer.focusMinutes;
    const nextBreakMinutes = durationMode === 'custom' ? customBreakMinutes : activeTimer.breakMinutes;
    const nextFocusSeconds = nextFocusMinutes * 60;

    const nextTimer: ActiveTimerState = {
      ...activeTimer,
      isRunning: false,
      isPaused: false,
      mode: 'focus',
      startedAtMs: undefined,
      phaseStartedAtMs: undefined,
      focusMinutes: nextFocusMinutes,
      breakMinutes: nextBreakMinutes,
      durationSeconds: nextFocusSeconds,
      phaseTotalSeconds: nextFocusSeconds,
      pausedRemainingSeconds: nextFocusSeconds,
      lastCompletedAtISO: new Date(completedAtMs).toISOString(),
    };

    saveActiveTimerState(nextTimer);
    onTimerChange(nextTimer);
    void playCompletionSound('break');
    showPhaseNotification('Break complete — ready for next focus');
  };

  useEffect(() => {
    if (!activeTimer.isRunning) {
      completedPhaseRef.current = null;
      return;
    }

    if (remainingSeconds > 0) {
      return;
    }

    const completionKey = `${activeTimer.mode}:${activeTimer.phaseStartedAtMs ?? activeTimer.startedAtMs ?? 0}`;
    if (completedPhaseRef.current === completionKey) {
      return;
    }

    completedPhaseRef.current = completionKey;
    if (activeTimer.mode === 'focus') {
      completeFocusPhase();
      return;
    }

    completeBreakPhase();
  }, [activeTimer, remainingSeconds]);

  const startTimer = () => {
    if (activeTimer.isRunning || activeTimer.isPaused) {
      setStartError('The timer is already active.');
      return;
    }

    const selectedCategory = activeTimer.category.trim();
    if (!selectedCategory) {
      setStartError('Choose a category before starting.');
      return;
    }

    const nowMs = Date.now();
    const nextFocusMinutes = durationMode === 'custom' ? customFocusMinutes : activeTimer.focusMinutes;
    const nextBreakMinutes = durationMode === 'custom' ? customBreakMinutes : activeTimer.breakMinutes;
    const durationSeconds = (activeTimer.mode === 'break' ? nextBreakMinutes : nextFocusMinutes) * 60;

    const nextTimer: ActiveTimerState = {
      ...activeTimer,
      isRunning: true,
      isPaused: false,
      mode: activeTimer.mode,
      category: selectedCategory,
      focusMinutes: nextFocusMinutes,
      breakMinutes: nextBreakMinutes,
      startedAtMs: nowMs,
      phaseStartedAtMs: nowMs,
      durationSeconds,
      phaseTotalSeconds: durationSeconds,
      pausedRemainingSeconds: undefined,
      autoStartBreak: false,
      lastCompletedAtISO: undefined,
    };

    saveActiveTimerState(nextTimer);
    onTimerChange(nextTimer);
    void prepareAudioContext();
    setStartError('');
    setToastMessage(`Focus started: ${selectedCategory}`);
    console.log('Focus activeTimer after Start', nextTimer);
  };

  const pauseTimer = () => {
    const nextRemainingSeconds = getDisplayRemainingSeconds(activeTimer, Date.now());

    onTimerChange({
      ...activeTimer,
      isRunning: false,
      isPaused: true,
      startedAtMs: undefined,
      durationSeconds: nextRemainingSeconds,
      pausedRemainingSeconds: nextRemainingSeconds,
    });
  };

  const resumeTimer = () => {
    const nextDurationSeconds = Math.max(0, activeTimer.pausedRemainingSeconds ?? remainingSeconds);
    const nowMs = Date.now();

    if (nextDurationSeconds <= 0) {
      return;
    }

    onTimerChange({
      ...activeTimer,
      isRunning: true,
      isPaused: false,
      startedAtMs: nowMs,
      phaseStartedAtMs: activeTimer.phaseStartedAtMs,
      durationSeconds: nextDurationSeconds,
      pausedRemainingSeconds: undefined,
    });
    void prepareAudioContext();
  };

  const stopTimer = () => {
    if (activeTimer.mode === 'focus') {
      const completedSeconds = Math.max(0, activeTimer.phaseTotalSeconds - remainingSeconds);

      if (completedSeconds >= 60) {
        const endedAtMs = Date.now();
        const startedAtMs = activeTimer.phaseStartedAtMs ?? endedAtMs - completedSeconds * 1000;

        onSessionComplete({
          id: `session-${endedAtMs}`,
          category: activeTimer.category,
          type: selectedSessionType,
          mode: 'focus',
          dateISO: todayISO(new Date(endedAtMs)),
          minutes: Math.max(1, Math.floor(completedSeconds / 60)),
          startAtISO: new Date(startedAtMs).toISOString(),
          endAtISO: new Date(endedAtMs).toISOString(),
          durationMinutes: Math.max(1, Math.floor(completedSeconds / 60)),
        });
      }
    }

    onTimerChange(resetTimerState(activeTimer));
  };

  const addCategory = () => {
    const nextName = customCategoryInput.trim();
    if (!nextName) {
      return;
    }

    onAddCategory(nextName);
    setCustomCategoryInput('');

    if (!activeTimer.isRunning && !activeTimer.isPaused) {
      onTimerChange({
        ...activeTimer,
        category: nextName,
      });
    }
  };

  const dismissToast = () => {
    setToastMessage('');
  };

  const showToast = Boolean(toastMessage);

  const ringColor = activeTimer.mode === 'focus' ? FOCUS_PRIMARY_TEAL : FOCUS_BREAK_TINT_DARK;
  const ringDashOffset = FOCUS_RING_CIRCUMFERENCE * (1 - remainingRatio);
  const phaseBadgeStyles = {
    root: {
      background:
        activeTimer.mode === 'focus'
          ? 'rgba(123, 196, 184, 0.18)'
          : 'rgba(123, 196, 184, 0.12)',
      color: activeTimer.mode === 'focus' ? FOCUS_PRIMARY_TEAL_DARK : FOCUS_BREAK_TINT_DARK,
      border: `1px solid ${
        activeTimer.mode === 'focus' ? 'rgba(123, 196, 184, 0.22)' : 'rgba(123, 196, 184, 0.16)'
      }`,
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.32)',
    },
  } as const;
  const startButtonStyles = {
    root: {
      background: FOCUS_PRIMARY_TEAL,
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
    },
  } as const;
  const tealButtonStyles = {
    root: {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
    },
  } as const;

  return (
    <div className="focus-layout">
      <div className="focus-hero-column">
        {showToast ? (
          <div className="focus-toast">
            <Notification color="sage" withCloseButton onClose={dismissToast} title="Focus">
              {toastMessage}
            </Notification>
          </div>
        ) : null}

        <Card withBorder radius="xl" shadow="sm" className="section-card focus-hero-card">
          <Stack align="center" justify="center" spacing="lg" className="focus-hero-content">
            <Badge variant="light" size="lg" styles={phaseBadgeStyles}>
              {activeTimer.mode === 'focus' ? 'FOCUS' : 'BREAK'}
            </Badge>

            <div className="focus-timer-circle">
              <svg viewBox="0 0 320 320" className="focus-timer-svg" aria-hidden="true">
                <circle className="focus-timer-track" cx="160" cy="160" r={FOCUS_RING_RADIUS} />
                <circle
                  className="focus-timer-progress"
                  cx="160"
                  cy="160"
                  r={FOCUS_RING_RADIUS}
                  style={{
                    stroke: ringColor,
                    strokeDasharray: FOCUS_RING_CIRCUMFERENCE,
                    strokeDashoffset: ringDashOffset,
                  }}
                />
              </svg>

              <div className="focus-timer-center">
                <Text className="focus-timer-time">{formatClock(remainingSeconds)}</Text>
                <Text size="sm" c="dimmed">
                  {activeTimer.category}
                </Text>
              </div>
            </div>

            <Group className="focus-actions">
              {!activeTimer.isRunning && !activeTimer.isPaused ? (
                <Button size="sm" color="sage" styles={startButtonStyles} onClick={startTimer}>
                  Start
                </Button>
              ) : null}
              {activeTimer.isRunning ? (
                <Button size="sm" variant="light" color="sage" styles={tealButtonStyles} onClick={pauseTimer}>
                  Pause
                </Button>
              ) : null}
              {activeTimer.isPaused ? (
                <Button size="sm" color="sage" styles={tealButtonStyles} onClick={resumeTimer}>
                  Resume
                </Button>
              ) : null}
              {(activeTimer.isRunning || activeTimer.isPaused) ? (
                <Button size="sm" variant="light" color="gray" onClick={stopTimer}>
                  Stop
                </Button>
              ) : null}
            </Group>

            {startError ? (
              <Text size="sm" c="danger" role="alert">
                {startError}
              </Text>
            ) : null}

            <Stack spacing={18} className="focus-controls">
              <Button size="xs" variant="subtle" onClick={toggleSoundEnabled}>
                {soundEnabled ? 'Mute timer sound' : 'Enable timer sound'}
              </Button>

              <Group grow>
                <Select
                  size="sm"
                  label="Timer sound"
                  data={SOUND_PROFILE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                  value={soundProfile}
                  onChange={(value) => {
                    if (value) {
                      const nextProfile = value as FocusSoundProfile;
                      setSoundProfile(nextProfile);
                      previewSound(nextProfile);
                    }
                  }}
                  disabled={!soundEnabled}
                  styles={{
                    label: {
                      color: '#1F2937',
                      fontWeight: 600,
                    },
                    input: {
                      minHeight: 38,
                      background: '#ffffff',
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      color: '#1F2937',
                    },
                    dropdown: {
                      background: '#ffffff',
                    },
                  }}
                />
                <Button
                  size="sm"
                  mt={26}
                  variant="light"
                  onClick={() => previewSound()}
                  disabled={!soundEnabled}
                >
                  Preview
                </Button>
              </Group>

              {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' ? (
                <Button size="xs" variant="subtle" onClick={() => void enableBrowserNotifications()}>
                  Enable browser notifications
                </Button>
              ) : null}

              {notificationPermission === 'granted' ? (
                <Text size="xs" c="dimmed">
                  Browser notifications enabled
                </Text>
              ) : null}

              <Select
                size="sm"
                label="Type"
                data={FOCUS_SESSION_TYPES.map((type) => ({ value: type, label: type }))}
                value={selectedSessionType}
                onChange={(value) => {
                  if (value) {
                    setSelectedSessionType(value as FocusSessionType);
                  }
                }}
                styles={{
                  label: {
                    color: '#1F2937',
                    fontWeight: 600,
                  },
                  input: {
                    minHeight: 42,
                    background: '#ffffff',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    color: '#1F2937',
                  },
                  dropdown: {
                    background: '#ffffff',
                  },
                }}
                disabled={activeTimer.isRunning || activeTimer.isPaused}
              />

              <SegmentedControl
                size="sm"
                className="focus-duration-segmented"
                value={durationMode}
                onChange={(value) => {
                  if (value === '25-5') {
                    setDurationMode('25-5');
                    updateDurations(25, 5);
                    return;
                  }

                  if (value === '50-10') {
                    setDurationMode('50-10');
                    updateDurations(50, 10);
                    return;
                  }

                  setDurationMode('custom');
                  updateDurations(customFocusMinutes, customBreakMinutes);
                }}
                data={[
                  { value: '25-5', label: '25/5' },
                  { value: '50-10', label: '50/10' },
                  { value: 'custom', label: 'Custom' },
                ]}
                styles={{
                  root: {
                    position: 'relative',
                    zIndex: 2,
                    minHeight: 48,
                    background: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    padding: 3,
                  },
                  control: {
                    minHeight: 44,
                  },
                  label: {
                    color: '#1F2937',
                    fontWeight: 600,
                    fontSize: 14,
                  },
                  indicator: {
                    background: FOCUS_PRIMARY_TEAL,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                  },
                }}
                disabled={activeTimer.isRunning || activeTimer.isPaused}
              />

              {durationMode === 'custom' ? (
                <>
                  <NumberInput
                    size="sm"
                    label="Custom focus minutes"
                    min={MIN_CUSTOM_MINUTES}
                    max={MAX_CUSTOM_MINUTES}
                    value={customFocusMinutes}
                    onChange={(value) => {
                      const nextMinutes =
                        typeof value === 'number' && Number.isFinite(value)
                          ? clampCustomMinutes(Math.round(value))
                          : customFocusMinutes;
                      setCustomFocusMinutes(nextMinutes);
                      updateDurations(nextMinutes, customBreakMinutes);
                    }}
                    styles={{
                      label: {
                        color: '#1F2937',
                        fontWeight: 600,
                      },
                      input: {
                        minHeight: 44,
                        background: '#ffffff',
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        color: '#1F2937',
                      },
                    }}
                    disabled={activeTimer.isRunning || activeTimer.isPaused}
                  />

                  <NumberInput
                    size="sm"
                    label="Custom break minutes"
                    min={MIN_CUSTOM_MINUTES}
                    max={MAX_CUSTOM_MINUTES}
                    value={customBreakMinutes}
                    onChange={(value) => {
                      const nextMinutes =
                        typeof value === 'number' && Number.isFinite(value)
                          ? clampCustomMinutes(Math.round(value))
                          : customBreakMinutes;
                      setCustomBreakMinutes(nextMinutes);
                      updateDurations(customFocusMinutes, nextMinutes);
                    }}
                    styles={{
                      label: {
                        color: '#1F2937',
                        fontWeight: 600,
                      },
                      input: {
                        minHeight: 44,
                        background: '#ffffff',
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        color: '#1F2937',
                      },
                    }}
                    disabled={activeTimer.isRunning || activeTimer.isPaused}
                  />
                </>
              ) : null}
            </Stack>
          </Stack>
        </Card>
      </div>

      <Stack spacing="md" className="focus-side-column">
        <Card withBorder radius="xl" shadow="sm" className="section-card focus-side-card">
          <Text size="sm" c="dimmed" className="focus-stat-caption">
            Focus Time of Today
          </Text>
          <Title order={2} mt={6} className="focus-stat-value">
            {formatFocusMinutes(totalFocusMinutes)}
          </Title>
          <Text size="sm" c="dimmed" mt={6} className="focus-stat-meta">
            {todayFocusSessions.length} focus sessions completed today
          </Text>
        </Card>

        <Card withBorder radius="xl" shadow="sm" className="section-card focus-side-card">
          <Text fw={700} className="focus-side-heading">Today</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Pick the category for the next session.
          </Text>

          <Stack spacing="xs" mt="md">
            {categoryStats.map((item) => (
              <button
                key={item.category}
                type="button"
                className={`focus-category-row${activeTimer.category === item.category ? ' focus-category-row-active' : ''}`}
                onClick={() => setCategory(item.category)}
                disabled={activeTimer.isRunning || activeTimer.isPaused}
              >
                <Group position="apart" align="center" noWrap>
                  <Group spacing="sm" noWrap>
                    <Radio checked={activeTimer.category === item.category} onChange={() => undefined} />
                    <div>
                      <Text fw={600}>{item.category}</Text>
                      <Text size="xs" c="dimmed">
                        {item.count} sessions
                      </Text>
                    </div>
                  </Group>
                  <Badge variant="light" style={{ color: colorByCategory[item.category], background: `${colorByCategory[item.category]}18` }}>
                    {formatFocusMinutes(item.minutes)}
                  </Badge>
                </Group>
              </button>
            ))}
          </Stack>

          <Group mt="md" grow align="flex-end">
            <TextInput
              label="Custom category"
              placeholder="Add a new category"
              value={customCategoryInput}
              onChange={(event) => setCustomCategoryInput(event.currentTarget.value)}
            />
            <Button variant="light" onClick={addCategory}>
              Add
            </Button>
          </Group>
        </Card>

        <Card withBorder radius="xl" shadow="sm" className="section-card focus-side-card">
          <Text fw={700} className="focus-side-heading">Today&apos;s Focus Time Records</Text>
          <Text size="sm" c="dimmed" mt={4}>
            A simple day timeline of completed focus sessions.
          </Text>

          <div className="focus-timeline" aria-label="Today focus timeline">
            <div className="focus-timeline-track">
              {timelineSegments.map((segment) => (
                <span
                  key={segment.id}
                  className="focus-timeline-segment"
                  style={{
                    left: `${segment.leftPercent}%`,
                    width: `${segment.widthPercent}%`,
                    background: segment.color,
                    opacity: segment.isActive ? 0.6 : 1,
                    boxShadow: segment.isActive ? `0 0 0 1px ${segment.color} inset` : undefined,
                  }}
                  title={segment.isActive ? `${segment.category} (${activeFocusSession?.statusLabel ?? 'In progress'})` : `${segment.category}`}
                />
              ))}
            </div>

            <div className="focus-timeline-labels">
              <Text size="xs" c="dimmed">
                00:00
              </Text>
              <Text size="xs" c="dimmed">
                12:00
              </Text>
              <Text size="xs" c="dimmed">
                24:00
              </Text>
            </div>
          </div>

          <Stack spacing="xs" mt="md">
            {activeFocusSession ? (
              <Group position="apart" noWrap>
                <Group spacing="xs" noWrap>
                  <span
                    className="focus-session-dot"
                    style={{ background: colorByCategory[activeFocusSession.category] ?? CATEGORY_COLORS[0], opacity: 0.7 }}
                  />
                  <div>
                    <Group spacing={6} noWrap>
                      <Text size="sm" fw={600}>
                        {activeFocusSession.category}
                      </Text>
                      <Badge size="xs" variant="light" color={activeTimer.isRunning ? 'sage' : 'gray'}>
                        {activeFocusSession.statusLabel}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {formatTimeLabel(activeFocusSession.startAtISO)} - {formatClock(activeFocusSession.elapsedSeconds)}
                    </Text>
                  </div>
                </Group>
                <Text size="sm">{formatFocusMinutes(activeFocusSession.elapsedMinutes)}</Text>
              </Group>
            ) : null}

            {recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <Group key={session.id} position="apart" noWrap>
                  <Group spacing="xs" noWrap>
                    <span
                      className="focus-session-dot"
                      style={{ background: colorByCategory[session.category] ?? CATEGORY_COLORS[0] }}
                    />
                    <div>
                      <Text size="sm" fw={600}>
                        {session.category}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatTimeLabel(session.startAtISO)} - {formatTimeLabel(session.endAtISO)}
                      </Text>
                    </div>
                  </Group>
                  <Text size="sm">{session.minutes} min</Text>
                </Group>
              ))
            ) : (
              !activeFocusSession ? (
                <Text size="sm" c="dimmed">
                  No focus sessions recorded yet today.
                </Text>
              ) : null
            )}
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}
