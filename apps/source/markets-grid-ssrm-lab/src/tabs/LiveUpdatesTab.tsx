import { LabFeatureTab } from './LabFeatureTab';
import { LIVE_FEATURE } from './labFeatureConfigs';

export function LiveUpdatesTab() {
  return <LabFeatureTab config={LIVE_FEATURE} />;
}
