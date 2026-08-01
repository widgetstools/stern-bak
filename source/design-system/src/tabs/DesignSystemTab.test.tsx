import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../../test-utils/queries';
import { DesignSystemTab } from './DesignSystemTab';

describe('DesignSystemTab', () => {
  it('renders nav and default overview section', () => {
    render(<DesignSystemTab />);
    expect(getOneByTestId('ds-designsystem')).toBeInTheDocument();
    expect(getOneByTestId('ds-overview')).toBeInTheDocument();
  });

  it('switches between foundation and component sections', async () => {
    render(<DesignSystemTab />);
    await userEvent.click(getOneByTestId('ds-section-palette'));
    expect(getOneByTestId('ds-palette')).toBeInTheDocument();
    await userEvent.click(getOneByTestId('ds-section-buttons'));
    expect(getOneByTestId('ds-demo-button')).toBeInTheDocument();
  });
});
