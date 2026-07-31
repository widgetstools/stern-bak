/**
 * Optional plugin hook point for StarGridApp.
 */
export interface StarGridPlugin {
  readonly id: string;
  register?(ctx: { appId: string }): void | Promise<void>;
}

export function defineStarGridPlugin(plugin: StarGridPlugin): StarGridPlugin {
  return plugin;
}
