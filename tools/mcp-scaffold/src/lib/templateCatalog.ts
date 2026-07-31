export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  defaultPort: number;
  includesStompServer: boolean;
  includesOpenFin: boolean;
  buckets: string[];
  worker: boolean;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'basic',
    name: 'Basic MarketsGrid',
    description: 'Static rowData MarketsGrid with localStorage profiles — no data providers.',
    defaultPort: 5194,
    includesStompServer: false,
    includesOpenFin: false,
    buckets: ['design-system', 'react-ui', 'react-grid', 'shared'],
    worker: false,
  },
  {
    id: 'mockdata-provider',
    name: 'Mock Data Provider',
    description: 'SharedWorker mock streaming into MarketsGrid.',
    defaultPort: 5192,
    includesStompServer: true,
    includesOpenFin: false,
    buckets: ['design-system', 'react-ui', 'react-grid', 'shared', 'data'],
    worker: true,
  },
  {
    id: 'dataprovider-editor',
    name: 'Data Provider Editor',
    description: 'HostedMarketsGrid with DataProviderEditor tabs.',
    defaultPort: 5193,
    includesStompServer: true,
    includesOpenFin: false,
    buckets: ['design-system', 'react-ui', 'react-grid', 'shared', 'data', 'react-core'],
    worker: true,
  },
  {
    id: 'stomp',
    name: 'STOMP Streaming',
    description: 'HostedMarketsGrid fed by STOMP WebSocket via SharedWorker.',
    defaultPort: 5200,
    includesStompServer: true,
    includesOpenFin: false,
    buckets: ['design-system', 'react-ui', 'react-grid', 'shared', 'data', 'react-core'],
    worker: true,
  },
  {
    id: 'openfin-platform',
    name: 'OpenFin Platform',
    description: 'Full OpenFin workspace reference — route-hosted HostedMarketsGrid + launcher.',
    defaultPort: 5174,
    includesStompServer: true,
    includesOpenFin: true,
    buckets: ['design-system', 'react-ui', 'react-grid', 'shared', 'data', 'react-core', 'openfin'],
    worker: true,
  },
];

export function getTemplate(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): TemplateInfo[] {
  return TEMPLATES;
}
