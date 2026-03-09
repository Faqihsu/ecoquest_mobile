/**
 * rewardNotifications.ts — Local Push Notification Service
 *
 * Monitors pending staking rewards and sends a local notification
 * when they reach a claimable threshold.
 *
 * Uses expo-notifications (local-only, no push server needed).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum pending rewards (SKR) before notifying user */
const DEFAULT_CLAIM_THRESHOLD = 10;

/** Minimum interval between notifications (ms) — prevent spam */
const MIN_NOTIFICATION_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Channel ID for Android */
const CHANNEL_ID = 'staking-rewards';

let lastNotifiedAt = 0;

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Configure notification handler and Android channel.
 * Call this once at app startup (e.g., in App.tsx).
 */
export async function setupRewardNotifications(): Promise<void> {
  // Set handler — show notification even when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Staking Rewards',
      description: 'Notifications when your staking rewards are ready to claim',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00ff87',
    });
  }
}

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Request notification permissions.
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Schedule Notification ─────────────────────────────────────────────────────

/**
 * Check pending rewards and send a local notification if threshold reached.
 *
 * Call this periodically (e.g., in StakingScreen's reward ticker useEffect,
 * or in a background task).
 *
 * @param pendingRewards - Current pending SKR rewards
 * @param threshold      - Minimum rewards to trigger notification (default: 10 SKR)
 */
export async function checkAndNotifyRewards(
  pendingRewards: number,
  threshold: number = DEFAULT_CLAIM_THRESHOLD,
): Promise<void> {
  // Guard: below threshold
  if (pendingRewards < threshold) return;

  // Guard: too soon since last notification
  const now = Date.now();
  if (now - lastNotifiedAt < MIN_NOTIFICATION_INTERVAL_MS) return;

  // Guard: permissions
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Send local notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💰 Rewards Ready to Claim!',
      body: `You have ${pendingRewards.toFixed(2)} SKR pending rewards in Staking Hub. Claim now before the epoch resets!`,
      data: { screen: 'Staking', pendingRewards },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
    },
    trigger: null, // Immediate
  });

  lastNotifiedAt = now;
  console.log(`[Notifications] Reward alert sent: ${pendingRewards.toFixed(2)} SKR`);
}

// ── Schedule Reminder ─────────────────────────────────────────────────────────

/**
 * Schedule a daily reminder to check staking rewards.
 * Fires once per day at the specified hour.
 */
export async function scheduleDailyRewardReminder(hour: number = 9): Promise<string> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    throw new Error('Notification permission denied');
  }

  // Cancel existing daily reminders first
  await cancelDailyRewardReminder();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🌱 Check Your Staking Rewards',
      body: 'Your SKR tokens have been earning rewards! Open EcoQuest to see your balance.',
      data: { screen: 'Staking' },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
    },
    trigger: {
      hour,
      minute: 0,
      repeats: true,
    },
  });

  console.log(`[Notifications] Daily reminder scheduled at ${hour}:00, id=${id}`);
  return id;
}

/**
 * Cancel the daily reward reminder.
 */
export async function cancelDailyRewardReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── Notification Response Handler ─────────────────────────────────────────────

/**
 * Listen for notification taps — navigate to the relevant screen.
 * Call this in App.tsx or a navigation-aware component.
 *
 * @param navigate - Navigation function (e.g., navigation.navigate)
 */
export function addNotificationResponseListener(
  navigate: (screen: string) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.screen && typeof data.screen === 'string') {
        navigate(data.screen);
      }
    },
  );

  return () => subscription.remove();
}
