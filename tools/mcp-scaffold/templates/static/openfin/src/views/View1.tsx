import * as Notifications from "@openfin/notifications";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function View1() {
  const [notificationActionMessage, setNotificationActionMessage] = useState("");

  useEffect(() => {
    let handler: ((event: Notifications.NotificationActionEvent) => void) | undefined;

    Notifications.register().then(() => {
      handler = (event: Notifications.NotificationActionEvent) => {
        console.log("Notification clicked:", event.result["customData"]);
        setNotificationActionMessage(event.result["customData"]);
      };
      Notifications.addEventListener("notification-action", handler);
    }).catch((err) => {
      console.warn("Notifications registration failed:", err);
    });

    return () => {
      if (handler) {
        Notifications.removeEventListener("notification-action", handler);
      }
    };
  }, []);

  async function showNotification() {
    if (typeof fin === "undefined") return;
    const platformUuid = (fin as typeof import("@openfin/core").fin).me?.identity?.uuid;
    if (!platformUuid) return;
    await Notifications.create({
      platform: platformUuid,
      title: "Simple Notification",
      body: "This is a simple notification",
      toast: "transient",
      buttons: [
        {
          title: "Click me",
          type: "button",
          cta: true,
          onClick: {
            customData: "custom notification data",
          },
        },
      ],
    });
  }

  async function broadcastFDC3Context() {
    if (typeof fdc3 === "undefined") return;
    await fdc3.broadcast({
      type: "fdc3.instrument",
      name: "Microsoft Corporation",
      id: {
        ticker: "MSFT",
      },
    });
  }

  async function broadcastFDC3ContextAppChannel() {
    if (typeof fdc3 === "undefined") return;
    const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
    await appChannel.broadcast({
      type: "fdc3.instrument",
      name: "Apple Inc.",
      id: {
        ticker: "AAPL",
      },
    });
  }

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React View 1</h1>
          <p className="text-sm text-muted-foreground">React app view in an OpenFin workspace</p>
        </div>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>Workspace Features</CardTitle>
            <CardDescription>Notifications and FDC3 broadcasting</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => showNotification()}>Show Notification</Button>
            <Button variant="secondary" onClick={() => broadcastFDC3Context()}>
              Broadcast FDC3 Context
            </Button>
            <Button variant="outline" onClick={() => broadcastFDC3ContextAppChannel()}>
              Broadcast FDC3 Context on App Channel
            </Button>
            {notificationActionMessage && (
              <p className="text-sm text-muted-foreground">
                Notification action: {notificationActionMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default View1;
