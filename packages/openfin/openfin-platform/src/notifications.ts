import * as Notifications from "@openfin/workspace/notifications";

export async function registerNotifications(): Promise<Notifications.NotificationsRegistration | undefined> {
  console.log("Initializing the notification provider.");

  try {
    const metaInfo = await Notifications.register();
    console.log("Notification provider initialized.", metaInfo);
    return metaInfo;
  } catch (err) {
    console.error("An error was encountered while trying to register the notifications provider", err);
    return undefined;
  }
}
