import type { ResearchNote } from '../../data/types';

type Rating = ResearchNote['rating'];

export function ratingBadgeStyle(rating: Rating): React.CSSProperties {
  switch (rating) {
    case 'Overweight':
      return {
        background: 'var(--ds-overlay-positive-soft)',
        color: 'var(--ds-accent-positive)',
        border: '1px solid var(--ds-overlay-positive-ring)',
      };
    case 'Underweight':
      return {
        background: 'var(--ds-overlay-negative-soft)',
        color: 'var(--ds-accent-negative)',
        border: '1px solid var(--ds-overlay-negative-ring)',
      };
    case 'Market Weight':
      return {
        background: 'var(--ds-overlay-warning-soft)',
        color: 'var(--ds-accent-warning)',
        border: '1px solid var(--ds-overlay-warning-ring)',
      };
  }
}
