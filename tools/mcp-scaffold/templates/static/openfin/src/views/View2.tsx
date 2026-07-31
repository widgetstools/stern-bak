import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function View2() {
  const [message, setMessage] = useState("");
  const listenersRef = useRef<Array<{ unsubscribe: () => void }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function setupListeners() {
      if (typeof fdc3 === "undefined") return;

      // System channel listener
      const systemListener = await fdc3.addContextListener((context) => {
        if (!cancelled) setMessage(JSON.stringify(context, undefined, "  "));
      });
      listenersRef.current.push(systemListener);

      // App channel listener
      const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
      const appListener = await appChannel.addContextListener((context) => {
        if (!cancelled) setMessage(JSON.stringify(context, undefined, "  "));
      });
      listenersRef.current.push(appListener);
    }

    setupListeners();

    return () => {
      cancelled = true;
      for (const listener of listenersRef.current) {
        listener.unsubscribe();
      }
      listenersRef.current = [];
    };
  }, []);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React View 2</h1>
          <p className="text-sm text-muted-foreground">React app view in an OpenFin workspace</p>
        </div>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>FDC3 Context Listener</CardTitle>
            <CardDescription>Receives broadcast context from View 1</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <pre className="w-full min-h-[110px] rounded-md bg-muted p-3 font-mono text-sm">
              {message}
            </pre>
            <Button variant="outline" onClick={() => setMessage("")}>
              Clear
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default View2;
