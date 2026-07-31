import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";

/**
 * Home route (`/`). Intentionally thin — in OpenFin the real entry points
 * are the dock (Tools menu + registered components) and the hosted grid
 * route. These links are dev-mode shortcuts for driving the app in a plain
 * browser tab without the OpenFin container.
 */
function App() {
  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-col">
        <h1 className="text-xl font-bold">Star Demo</h1>
        <p className="text-sm text-muted-foreground">
          Minimal OpenFin workspace hosting MarketsGrid via routes.
        </p>
      </header>

      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Launch in OpenFin</CardTitle>
            <CardDescription>Run the workspace container</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Start the dev server, then launch the OpenFin client:</p>
            <pre className="mt-2 rounded-md bg-muted p-3 font-mono text-sm">npm run client</pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Authoring tools (Workspace Setup, Data Providers, Config Browser)
              live in the dock&apos;s ▾ Tools menu.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hosted MarketsGrid</CardTitle>
            <CardDescription>
              The route below is the registrable workspace component — bind it to
              a saved DataProvider to see rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link to="/blotters/marketsgrid" className="text-sm text-primary hover:underline">
              /blotters/marketsgrid &mdash; MarketsGrid blotter
            </Link>
            <Link to="/dataproviders" className="text-sm text-primary hover:underline">
              /dataproviders &mdash; Create / edit STOMP, REST, Mock and AppData providers
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
