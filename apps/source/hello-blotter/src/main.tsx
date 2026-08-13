import { createRoot } from 'react-dom/client';
import { createStarui } from '@wellsfargo-starui/react/data/runtime';
import { StarGrid } from '@wellsfargo-starui/grid/widgets';
import './index.css';

const starui = createStarui({
  appId: 'HelloBlotter',
  userId: 'demo',
  providers: [{
    providerId: 'dp-hello-positions', name: 'Positions (live)',
    providerType: 'stomp-ssrm', userId: 'demo',
    config: {
      providerType: 'stomp-ssrm',
      websocketUrl: 'ws://localhost:8081',
      listenerTopic: '/snapshot/positions/trd1',
      requestMessage: '/snapshot/positions/trd1/1000/10',
      snapshotEndToken: 'Success',
      keyColumn: 'positionId', publishWindowMs: 200,
    },
  }],
});

createRoot(document.getElementById('root')!).render(
  <starui.Provider>
    <StarGrid gridId="hello-blotter" providerId="dp-hello-positions" title="Positions" fullBleed />
  </starui.Provider>,
);
