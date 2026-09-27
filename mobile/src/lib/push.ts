import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

// How notifications behave when received while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests notification permission, fetches this device's Expo push token, and
 * stores it against the signed-in user so the server can push to them.
 * Returns the current permission status.
 */
export async function registerForPush(userId: string): Promise<"granted" | "denied" | "undetermined"> {
  if (!Device.isDevice) return "undetermined";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#EF5E77",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted" && existing.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return status === "denied" ? "denied" : "undetermined";

  try {
    // Native device token (on Android this is the FCM registration token we
    // send to via FCM v1 from the server).
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = typeof tokenResp.data === "string" ? tokenResp.data : String(tokenResp.data ?? "");
    if (token) {
      await supabase
        .from("push_tokens")
        .upsert(
          { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
          { onConflict: "token" }
        );
    }
  } catch {
    // Token fetch can fail if FCM/APNs credentials aren't configured yet — the
    // in-app bell still works; we just won't have a device token to push to.
  }
  return "granted";
}

/** Removes this device's token (call on sign-out). */
export async function unregisterPush() {
  try {
    if (!Device.isDevice) return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = typeof tokenResp.data === "string" ? tokenResp.data : String(tokenResp.data ?? "");
    if (token) await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // ignore
  }
}
