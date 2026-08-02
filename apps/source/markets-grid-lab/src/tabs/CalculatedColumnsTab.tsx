import { LabFeatureTab } from './LabFeatureTab';
import { CALCULATED_FEATURE } from './labFeatureConfigs';

export function CalculatedColumnsTab() {
  return <LabFeatureTab config={CALCULATED_FEATURE} />;
}
