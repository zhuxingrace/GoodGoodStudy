import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Notification,
  NumberInput,
  Popover,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  FOCUS_SESSION_TYPES,
  getDisplayRemainingSeconds,
  getPhaseDurationSeconds,
  isPresetTimerCategory,
  resetTimerState,
  type FocusSessionType,
  type ActiveTimerState,
  type TimeSession,
  type WidgetPosition,
} from '../lib/timeTracker';

interface PomodoroWidgetProps {
  activeTimer: ActiveTimerState;
  currentTimeMs: number;
  categories: string[];
  widgetPosition: WidgetPosition;
  onTimerChange: (next: ActiveTimerState) => void;
  onWidgetPositionChange: (next: WidgetPosition) => void;
  onAddCategory: (name: string) => void;
  onResetPosition: () => void;
  onSessionComplete: (session: TimeSession) => void;
}

const CUSTOM_CATEGORY_VALUE = '__custom__';
const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const getSessionTypeFromCategory = (category: string): FocusSessionType =>
  (FOCUS_SESSION_TYPES as readonly string[]).includes(category) ? (category as FocusSessionType) : 'Other';

export default function PomodoroWidget({
  activeTimer,
  currentTimeMs,
  categories,
  onTimerChange,
  onAddCategory,
  onSessionComplete,
}: PomodoroWidgetProps) {
  const [opened, { toggle, close, open }] = useDisclosure(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomDurations, setShowCustomDurations] = useState(
    !(
      (activeTimer.focusMinutes === 25 && activeTimer.breakMinutes === 5) ||
      (activeTimer.focusMinutes === 50 && activeTimer.breakMinutes === 10)
    ),
  );
  const [animationClass, setAnimationClass] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [startError, setStartError] = useState('');
  const completedPhaseRef = useRef<string | null>(null);

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
    if (!animationClass) {
      return;
    }

    const timeout = window.setTimeout(() => setAnimationClass(''), 900);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [animationClass]);

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
    completePhase(currentTimeMs);
  }, [activeTimer, currentTimeMs, remainingSeconds]);

  const showCompletionPulse =
    !activeTimer.isRunning &&
    !activeTimer.isPaused &&
    Boolean(activeTimer.lastCompletedAtISO) &&
    currentTimeMs - Date.parse(activeTimer.lastCompletedAtISO ?? '') < 4000;

  const handleCategorySelect = (value: string | null) => {
    if (!value) {
      return;
    }

    setStartError('');

    if (value === CUSTOM_CATEGORY_VALUE) {
      setShowCustomCategory(true);
      return;
    }

    setShowCustomCategory(false);
    onTimerChange({
      ...activeTimer,
      category: value,
    });
  };

  const saveCustomCategory = () => {
    const nextName = customCategoryInput.trim();
    if (!nextName) {
      setStartError('Save a category name before starting.');
      return;
    }

    onAddCategory(nextName);
    onTimerChange({
      ...activeTimer,
      category: nextName,
    });
    setCustomCategoryInput('');
    setShowCustomCategory(false);
    setStartError('');
  };

  const updateDurations = (focusMinutes: number, breakMinutes: number) => {
    const nextMode = activeTimer.mode;
    const nextPhaseSeconds = (nextMode === 'focus' ? focusMinutes : breakMinutes) * 60;
    onTimerChange({
      ...activeTimer,
      focusMinutes,
      breakMinutes,
      durationSeconds: activeTimer.isRunning || activeTimer.isPaused ? activeTimer.durationSeconds : nextPhaseSeconds,
      phaseTotalSeconds:
        activeTimer.isRunning || activeTimer.isPaused ? activeTimer.phaseTotalSeconds : nextPhaseSeconds,
      pausedRemainingSeconds:
        activeTimer.isRunning || activeTimer.isPaused ? activeTimer.pausedRemainingSeconds : nextPhaseSeconds,
    });
  };

  const startTimer = () => {
    const nextCategory = showCustomCategory ? '' : activeTimer.category.trim();
    if (!nextCategory) {
      setStartError('Choose or save a category before starting.');
      return;
    }

    const nowMs = Date.now();
    const durationSeconds = activeTimer.focusMinutes * 60;

    console.log('START clicked', {
      ...activeTimer,
      category: nextCategory,
      startedAtMs: nowMs,
      durationSeconds,
      isRunning: true,
      isPaused: false,
      mode: 'focus',
    });

    onTimerChange({
      ...activeTimer,
      isRunning: true,
      isPaused: false,
      mode: 'focus',
      category: nextCategory,
      startedAtMs: nowMs,
      phaseStartedAtMs: nowMs,
      durationSeconds,
      phaseTotalSeconds: durationSeconds,
      pausedRemainingSeconds: undefined,
    });
    setStartError('');
    setToastMessage('Timer started');
    setAnimationClass('tomato-pop');
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
      durationSeconds: nextDurationSeconds,
      pausedRemainingSeconds: undefined,
    });
  };

  const stopTimer = () => {
    const completedSeconds = Math.max(0, activeTimer.phaseTotalSeconds - remainingSeconds);

    if (completedSeconds >= 60) {
      const endedAtMs = Date.now();
      const startedAtMs = activeTimer.phaseStartedAtMs ?? endedAtMs - completedSeconds * 1000;

      onSessionComplete({
        id: `session-${endedAtMs}`,
        category: activeTimer.category,
        type: getSessionTypeFromCategory(activeTimer.category),
        mode: activeTimer.mode,
        dateISO: new Date(endedAtMs).toISOString().slice(0, 10),
        minutes: Math.max(1, Math.floor(completedSeconds / 60)),
        startAtISO: new Date(startedAtMs).toISOString(),
        endAtISO: new Date(endedAtMs).toISOString(),
        durationMinutes: Math.max(1, Math.floor(completedSeconds / 60)),
      });
    }

    onTimerChange(resetTimerState(activeTimer));
  };

  const skipBreak = () => {
    if (activeTimer.mode !== 'break') {
      return;
    }

    onTimerChange({
      ...activeTimer,
      isRunning: false,
      isPaused: false,
      mode: 'focus',
      startedAtMs: undefined,
      phaseStartedAtMs: undefined,
      durationSeconds: activeTimer.focusMinutes * 60,
      phaseTotalSeconds: activeTimer.focusMinutes * 60,
      pausedRemainingSeconds: activeTimer.focusMinutes * 60,
    });
  };

  const completePhase = (completedAtMs = Date.now()) => {
    const completedAtISO = new Date(completedAtMs).toISOString();
    const durationMinutes = activeTimer.mode === 'focus' ? activeTimer.focusMinutes : activeTimer.breakMinutes;
    const fallbackStart = new Date(completedAtMs - durationMinutes * 60 * 1000).toISOString();

    onSessionComplete({
      id: `session-${completedAtMs}`,
      category: activeTimer.category,
      type: getSessionTypeFromCategory(activeTimer.category),
      mode: activeTimer.mode,
      dateISO: new Date(completedAtMs).toISOString().slice(0, 10),
      minutes: durationMinutes,
      startAtISO: activeTimer.phaseStartedAtMs ? new Date(activeTimer.phaseStartedAtMs).toISOString() : fallbackStart,
      endAtISO: completedAtISO,
      durationMinutes,
    });

    setToastMessage(
      activeTimer.mode === 'focus'
        ? `${activeTimer.category} focus finished.`
        : `${activeTimer.category} break finished.`,
    );
    setAnimationClass('tomato-bounce');

    if (activeTimer.mode === 'focus') {
      if (activeTimer.autoStartBreak) {
        onTimerChange({
          ...activeTimer,
          isRunning: true,
          isPaused: false,
          mode: 'break',
          startedAtMs: completedAtMs,
          phaseStartedAtMs: completedAtMs,
          durationSeconds: activeTimer.breakMinutes * 60,
          phaseTotalSeconds: activeTimer.breakMinutes * 60,
          pausedRemainingSeconds: undefined,
          lastCompletedAtISO: completedAtISO,
        });
        return;
      }

      onTimerChange({
        ...activeTimer,
        isRunning: false,
        isPaused: false,
        mode: 'break',
        startedAtMs: undefined,
        phaseStartedAtMs: undefined,
        durationSeconds: activeTimer.breakMinutes * 60,
        phaseTotalSeconds: activeTimer.breakMinutes * 60,
        pausedRemainingSeconds: activeTimer.breakMinutes * 60,
        lastCompletedAtISO: completedAtISO,
      });
      return;
    }

    onTimerChange({
      ...activeTimer,
      isRunning: false,
      isPaused: false,
      mode: 'focus',
      startedAtMs: undefined,
      phaseStartedAtMs: undefined,
      durationSeconds: activeTimer.focusMinutes * 60,
      phaseTotalSeconds: activeTimer.focusMinutes * 60,
      pausedRemainingSeconds: activeTimer.focusMinutes * 60,
      lastCompletedAtISO: completedAtISO,
    });
  };

  const durationPreset =
    activeTimer.focusMinutes === 25 && activeTimer.breakMinutes === 5
      ? '25-5'
      : activeTimer.focusMinutes === 50 && activeTimer.breakMinutes === 10
        ? '50-10'
        : 'custom';

  const categoryOptions = [
    ...categories.map((category) => ({ value: category, label: category })),
    { value: CUSTOM_CATEGORY_VALUE, label: 'Custom' },
  ];

  const isIdle = !activeTimer.isRunning && !activeTimer.isPaused;
  const widgetLabel =
    activeTimer.isRunning || activeTimer.isPaused
      ? formatClock(remainingSeconds)
      : activeTimer.mode === 'focus' && remainingSeconds === activeTimer.focusMinutes * 60
        ? 'Start'
        : formatClock(remainingSeconds);
  const ringColor = activeTimer.mode === 'focus' ? '#d94841' : '#1098ad';
  const ringDashOffset = RING_CIRCUMFERENCE * (1 - remainingRatio);

  return (
    <>
      {toastMessage ? (
        <div className="pomodoro-toast">
          <Notification color="sage" withCloseButton={false} radius="xl">
            {toastMessage}
          </Notification>
        </div>
      ) : null}

      <div className="pomodoro-widget-shell">
        <Popover
          opened={opened}
          onChange={(next) => (next ? open() : close())}
          position="top-start"
          withArrow
          shadow="md"
          zIndex={10000}
        >
          <Popover.Target>
            <button
              type="button"
              className="pomodoro-widget-button"
              onClick={toggle}
              aria-label="Open pomodoro timer"
            >
              <span className={`tomato-widget ${animationClass}`}>
                <span className="tomato-ring" aria-hidden="true">
                  <svg viewBox="0 0 100 100" className="tomato-ring-svg">
                    <circle className="tomato-ring-track" cx="50" cy="50" r={RING_RADIUS} />
                    <circle
                      className="tomato-ring-progress"
                      cx="50"
                      cy="50"
                      r={RING_RADIUS}
                      style={{
                        stroke: ringColor,
                        strokeDasharray: RING_CIRCUMFERENCE,
                        strokeDashoffset: ringDashOffset,
                      }}
                    />
                  </svg>
                </span>
                <span className="tomato-core">
                  <span className="tomato-fruit">🍅</span>
                  {showCompletionPulse ? <span className="tomato-glow" /> : null}
                  <span className={`tomato-time-label${isIdle ? ' tomato-time-label-idle' : ''}`}>{widgetLabel}</span>
                </span>
              </span>
            </button>
          </Popover.Target>

          <Popover.Dropdown className="pomodoro-popover">
            <Stack spacing="md">
              <Group position="apart" align="center">
                <div>
                  <Text fw={700}>Pomodoro</Text>
                  <Text size="sm" c="dimmed">
                    {activeTimer.mode === 'focus' ? 'Focus mode' : 'Break mode'}
                  </Text>
                </div>
                <Badge color={activeTimer.mode === 'focus' ? 'sage' : 'gray'} variant="light">
                  {activeTimer.mode === 'focus' ? 'Focus' : 'Break'}
                </Badge>
              </Group>

              <div>
                <Text fw={700} size="xl">
                  {formatClock(remainingSeconds)}
                </Text>
                <Progress
                  value={progressValue}
                  radius="xl"
                  size="md"
                  mt="xs"
                  color={activeTimer.mode === 'focus' ? 'sage' : 'gray'}
                />
              </div>

              <Select
                label="Category"
                data={categoryOptions}
                value={showCustomCategory ? CUSTOM_CATEGORY_VALUE : activeTimer.category}
                onChange={handleCategorySelect}
                disabled={activeTimer.isRunning && activeTimer.mode === 'focus'}
                withinPortal
                zIndex={10001}
              />

              {startError ? (
                <Text size="xs" c="danger" role="alert">
                  {startError}
                </Text>
              ) : null}

              {showCustomCategory ? (
                <Group grow>
                  <TextInput
                    placeholder="Custom category"
                    value={customCategoryInput}
                    onChange={(event) => setCustomCategoryInput(event.currentTarget.value)}
                  />
                  <Button variant="light" onClick={saveCustomCategory}>
                    Save
                  </Button>
                </Group>
              ) : null}

              <SegmentedControl
                value={showCustomDurations ? 'custom' : durationPreset}
                onChange={(value) => {
                  if (value === '25-5') {
                    setShowCustomDurations(false);
                    updateDurations(25, 5);
                    return;
                  }

                  if (value === '50-10') {
                    setShowCustomDurations(false);
                    updateDurations(50, 10);
                    return;
                  }

                  setShowCustomDurations(true);
                }}
                data={[
                  { value: '25-5', label: '25/5' },
                  { value: '50-10', label: '50/10' },
                  { value: 'custom', label: 'Custom' },
                ]}
                disabled={activeTimer.isRunning || activeTimer.isPaused}
              />

                {showCustomDurations ? (
                  <Group grow>
                    <NumberInput
                      label="Focus"
                      min={1}
                      value={activeTimer.focusMinutes}
                      onChange={(value) =>
                        updateDurations(
                          typeof value === 'number' && value > 0 ? value : activeTimer.focusMinutes,
                          activeTimer.breakMinutes,
                        )
                      }
                      disabled={activeTimer.isRunning || activeTimer.isPaused}
                    />
                    <NumberInput
                      label="Break"
                      min={1}
                      value={activeTimer.breakMinutes}
                      onChange={(value) =>
                        updateDurations(
                          activeTimer.focusMinutes,
                          typeof value === 'number' && value > 0 ? value : activeTimer.breakMinutes,
                        )
                      }
                      disabled={activeTimer.isRunning || activeTimer.isPaused}
                    />
                  </Group>
                ) : null}

                <Switch
                  label="Auto-start break"
                  checked={activeTimer.autoStartBreak}
                  onChange={(event) =>
                    onTimerChange({
                      ...activeTimer,
                      autoStartBreak: event.currentTarget.checked,
                    })
                  }
                />

                <Group>
                  {!activeTimer.isRunning && !activeTimer.isPaused ? (
                    <Button color="sage" onClick={startTimer}>
                      Start
                    </Button>
                  ) : null}
                  {activeTimer.isRunning ? (
                    <Button variant="light" onClick={pauseTimer}>
                      Pause
                    </Button>
                  ) : null}
                  {activeTimer.isPaused ? (
                    <Button color="sage" onClick={resumeTimer}>
                      Resume
                    </Button>
                  ) : null}
                  {(activeTimer.isRunning || activeTimer.isPaused || activeTimer.mode === 'break') ? (
                    <Button variant="light" color="gray" onClick={stopTimer}>
                      Stop
                    </Button>
                  ) : null}
                  {activeTimer.mode === 'break' ? (
                    <Button variant="subtle" color="sage" onClick={skipBreak}>
                      Skip Break
                    </Button>
                  ) : null}
                </Group>

                {!isPresetTimerCategory(activeTimer.category) ? (
                  <Text size="xs" c="dimmed">
                    Custom category saved for reuse.
                  </Text>
                ) : null}

                <Group position="right">
                  <Button size="xs" variant="subtle" onClick={close}>
                    Close
                  </Button>
                </Group>
              </Stack>
          </Popover.Dropdown>
        </Popover>
      </div>
    </>
  );
}
