import {
  CONFIG_OR_CODE_RULES,
  type ConfigOrCodeRule,
} from '../../knowledge/layout.js';

export interface ConfigOrCodeInput {
  feature: string;
  hasOpenFin?: boolean;
  hasLiveData?: boolean;
  gridId?: string;
}

function matchRule(feature: string): ConfigOrCodeRule | null {
  for (const rule of CONFIG_OR_CODE_RULES) {
    if (rule.patterns.some((p) => p.test(feature))) return rule;
  }
  return null;
}

export function handleConfigOrCode(input: ConfigOrCodeInput) {
  const feature = input.feature.trim();
  if (!feature) {
    return { error: 'Describe the feature in the `feature` field.' };
  }

  const matched = matchRule(feature);
  const approach = matched?.approach ?? 'both';
  const base = matched ?? {
    approach: 'both' as const,
    artifacts: ['config/layouts/*.layout.json', 'src/App.tsx'],
    tools: ['starui_config_or_code', 'starui_generate_layout', 'starui_scaffold_app'],
    rationale:
      'No exact rule matched — default to layout JSON for grid behavior and scaffold code for wiring. Re-run with a more specific description.',
    patterns: [],
  };

  const hints: string[] = [];
  if (input.hasOpenFin && approach === 'layout') {
    hints.push('OpenFin app: add route/manifest code once; put grid presentation in config/layouts/.');
  }
  if (input.hasLiveData && /provider|stomp|live/i.test(feature) === false) {
    hints.push('Live data apps also need provider config — call starui_generate_stomp_config.');
  }
  if (input.gridId) {
    hints.push(`Target gridId "${input.gridId}" must match layout.profile.gridId and HostedMarketsGrid gridId.`);
  }

  return {
    feature,
    approach: base.approach,
    recommendation:
      base.approach === 'layout'
        ? 'Generate or import a layout JSON — do not add React for this behavior.'
        : base.approach === 'code'
          ? 'Scaffold wiring code — keep grid behavior in layouts.'
          : base.approach === 'monorepo'
            ? 'Extend platform packages first, then generate layouts.'
            : 'Split: thin bootstrap code + layout/provider config artifacts.',
    artifacts: base.artifacts,
    nextTools: base.tools,
    rationale: base.rationale,
    hints,
    terminology: {
      userFacing: 'layout',
      wireFormat: 'gc-profile export (profile.state holds customizer modules)',
      importPath: 'config/layouts/*.layout.json → Profile selector → Import',
    },
  };
}
