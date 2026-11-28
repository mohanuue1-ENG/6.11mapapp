import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { call } from './api';

// A reminder arrives when the office gives the driver a load. It has a "Start trip" button: pressing it opens the app
// and starts the trip for that load straight away, with no questions.
const CATEGORY = 'load';
const START = 'start';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Asks permission once, makes the Android channel and the button, and tells the server where to send reminders.
// It never throws: a problem with reminders must not stop the app.
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('loads', { name: 'New loads', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORY, [{ identifier: START, buttonTitle: 'Start trip', options: { opensAppToForeground: true } }]);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await call('/driver/push-token', { method: 'POST', body: JSON.stringify({ token: data }) });
  } catch {
    /* no reminders on this phone; the app carries on */
  }
}

type Handler = (loadId: string, startNow: boolean) => void;
const fromResponse = (r: Notifications.NotificationResponse | null, on: Handler) => {
  const d = r?.notification.request.content.data as { type?: string; loadId?: string } | undefined;
  if (d?.type === 'load' && d.loadId) on(d.loadId, r!.actionIdentifier === START);
};

// Calls back when the driver presses the reminder (open the loads) or its "Start trip" button (start now).
export function listenForLoadReminders(on: Handler): () => void {
  try {
    Notifications.getLastNotificationResponseAsync().then((r) => fromResponse(r, on)).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => fromResponse(r, on));
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
