import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";

function App() {
  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React</h1>
          <p className="text-sm text-muted-foreground">
            Example demonstrating running a React app in an OpenFin workspace
          </p>
        </div>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Launch this application in the OpenFin container</CardDescription>
          </CardHeader>
          <CardContent>
            <p>To launch this application in the OpenFin container, run the following command:</p>
            <pre className="mt-2 rounded-md bg-muted p-3 font-mono text-sm">npm run client</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blotters</CardTitle>
            <CardDescription>Hosted MarketsGrid instances — bind one to a saved DataProvider to see rows.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              to="/blotters/marketsgrid"
              className="text-sm text-primary hover:underline"
            >
              /blotters/marketsgrid &mdash; MarketsGrid blotter (data plane &middot; pick a provider)
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administration</CardTitle>
            <CardDescription>
              Authoring tools live in the dock&apos;s ▾ Tools menu — Workspace Setup,
              Data Providers, Component Registry, Config Browser, etc. The links
              below are dev-mode shortcuts for use outside OpenFin.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              to="/dataproviders"
              className="text-sm text-primary hover:underline"
            >
              /dataproviders &mdash; Create / edit STOMP, REST, Mock and AppData providers
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
