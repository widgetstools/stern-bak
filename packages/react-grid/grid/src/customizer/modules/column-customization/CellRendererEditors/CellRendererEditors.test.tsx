import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MARKET_ICON_SVGS } from '@wellsfargo-starui/design-system/icons/all-icons';
import { AllocationBarEditor } from './AllocationBarEditor';
import { CountryFlagEditor } from './CountryFlagEditor';
import { HeatmapEditor } from './HeatmapEditor';
import { IconTextEditor } from './IconTextEditor';
import { MultiLineEditor } from './MultiLineEditor';
import { PercentBarEditor } from './PercentBarEditor';
import { PillEditor } from './PillEditor';
import { RatingDeltaEditor } from './RatingDeltaEditor';
import { SparklineEditor } from './SparklineEditor';
import { TimeSinceEditor } from './TimeSinceEditor';
import { TrendArrowEditor } from './TrendArrowEditor';

const TID = 'cfg';

afterEach(() => cleanup());

function clickSwitch(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
}

function commitHex(testId: string, hex: string) {
  const input = screen.getByTestId(testId).querySelector('input')!;
  fireEvent.change(input, { target: { value: hex } });
  fireEvent.blur(input);
}

function clearColor(testId: string) {
  fireEvent.click(screen.getByTestId(testId).querySelector('[title="Clear color"]')!);
}

describe('CellRendererEditors', () => {
  it('AllocationBarEditor manages segments with existing value', () => {
    const onChange = vi.fn();
    render(
      <AllocationBarEditor
        value={{
          segmentColorMap: { equity: { dark: '#111', light: '#222' } },
          legend: false,
        }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-segment-0-key`), {
      target: { value: 'bond' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ segmentColorMap: expect.objectContaining({ bond: expect.any(Object) }) }),
    );

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-segment-0-remove`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ segmentColorMap: {} }));

    onChange.mockClear();
    clickSwitch(`${TID}-legend`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ legend: true }));
  });

  it('AllocationBarEditor adds a segment key', () => {
    const onChange = vi.fn();
    render(<AllocationBarEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-add-segment`));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ segmentColorMap: expect.any(Object) }),
    );
  });

  it('HeatmapEditor toggles domain', () => {
    const onChange = vi.fn();
    render(<HeatmapEditor value={undefined} onChange={onChange} testId={TID} />);
    clickSwitch(`${TID}-domain-toggle`);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ domain: { min: 0, max: 100 } }),
    );
  });

  it('HeatmapEditor edits domain min and toggles mid off', () => {
    const onChange = vi.fn();
    render(
      <HeatmapEditor
        value={{
          colorScale: {
            min: { dark: '#1', light: '#2' },
            max: { dark: '#3', light: '#4' },
            mid: { dark: '#5', light: '#6' },
          },
          domain: { min: 0, max: 50 },
        }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-domain-min`), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ domain: { min: 10, max: 50 } }),
    );

    onChange.mockClear();
    clickSwitch(`${TID}-mid-toggle`);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ colorScale: expect.not.objectContaining({ mid: expect.anything() }) }),
    );
  });

  it('IconTextEditor opens icon picker popover', async () => {
    render(<IconTextEditor value={undefined} onChange={() => {}} testId={TID} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`${TID}-icon-trigger`));
    });
    await waitFor(() => {
      const icons = screen
        .queryAllByTestId(new RegExp(`^${TID}-icon-`))
        .filter((el) => el.getAttribute('data-testid') !== `${TID}-icon-search`);
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  it('IconTextEditor switches position', () => {
    const onChange = vi.fn();
    render(
      <IconTextEditor
        value={{ iconId: 'x', iconSvg: '<svg/>', position: 'left' }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.click(screen.getByTestId(`${TID}-pos-right`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ position: 'right' }));
  });

  it('IconTextEditor filters icons, picks one, and edits icon color', async () => {
    const onChange = vi.fn();
    const iconId = Object.keys(MARKET_ICON_SVGS).sort()[0]!;
    render(
      <IconTextEditor
        value={{ iconId, iconSvg: MARKET_ICON_SVGS[iconId] ?? '', position: 'left' }}
        onChange={onChange}
        testId={TID}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId(`${TID}-icon-trigger`));
    });
    fireEvent.change(screen.getByPlaceholderText('Search icons…'), {
      target: { value: iconId.slice(0, 3) },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`${TID}-icon-${iconId}`));
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ iconId, iconSvg: MARKET_ICON_SVGS[iconId] }),
    );

    onChange.mockClear();
    const colorInput = screen.getByTestId(`${TID}-icon-color-dark`).querySelector('input')!;
    fireEvent.change(colorInput, { target: { value: 'AABBCC' } });
    fireEvent.blur(colorInput);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ iconColor: { dark: '#AABBCC' } }),
    );
  });

  it('MultiLineEditor edits secondary field and size', () => {
    const onChange = vi.fn();
    render(<MultiLineEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.change(screen.getByTestId(`${TID}-secondary-field`), {
      target: { value: 'subtitle' },
    });
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    fireEvent.keyDown(screen.getByTestId(`${TID}-secondary-size`), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalled();
  });

  it('PercentBarEditor toggles show percent and max source', () => {
    const onChange = vi.fn();
    render(<PercentBarEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-show-percent`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showPercent: true, showValue: false }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-max-field`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max: { fromField: '' } }));
  });

  it('PercentBarEditor edits field max and show value', () => {
    const onChange = vi.fn();
    render(
      <PercentBarEditor
        value={{ max: { fromField: 'cap' }, showPercent: true }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-max-field-name`), { target: { value: 'limit' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max: { fromField: 'limit' } }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-show-value`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showValue: true, showPercent: false }));
  });

  it('PillEditor adds rule', () => {
    const onChange = vi.fn();
    render(<PillEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-add-rule`));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ rules: expect.any(Array) }),
    );
  });

  it('PillEditor changes shape', () => {
    const onChange = vi.fn();
    render(
      <PillEditor
        value={{
          shape: 'pill',
          rules: [{ value: 'Buy', bg: { dark: '#1', light: '#2' } }],
        }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.click(screen.getByTestId(`${TID}-shape-square`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shape: 'square' }));
  });

  it('PillEditor edits and removes rules', () => {
    const onChange = vi.fn();
    render(
      <PillEditor
        value={{ rules: [{ value: 'Buy', bg: { dark: '#1', light: '#2' } }] }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-rule-0-value`), { target: { value: 'Sell' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ rules: [expect.objectContaining({ value: 'Sell' })] }),
    );

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-rule-0-remove`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rules: [] }));
  });

  it('RatingDeltaEditor adds rating and resets scale', () => {
    const onChange = vi.fn();
    render(<RatingDeltaEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-add-rating`));
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-reset-sp`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scale: expect.arrayContaining(['AAA']) }));
  });

  it('RatingDeltaEditor edits previous field and removes rating', () => {
    const onChange = vi.fn();
    render(
      <RatingDeltaEditor
        value={{ scale: ['AAA', 'AA'], previousField: 'prev' }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-previous-field`), { target: { value: 'oldRating' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ previousField: 'oldRating' }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-rating-0-remove`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scale: ['AA'] }));
  });

  it('SparklineEditor changes variant and height', () => {
    const onChange = vi.fn();
    render(<SparklineEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByText('Area'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ variant: 'area' }));

    onChange.mockClear();
    fireEvent.keyDown(screen.getByTestId(`${TID}-height`), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalled();
  });

  it('TimeSinceEditor adjusts refresh interval', () => {
    const onChange = vi.fn();
    render(<TimeSinceEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.keyDown(screen.getByTestId(`${TID}-refresh`), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refreshSec: expect.any(Number) }));
  });

  it('TrendArrowEditor edits threshold decimals and showDelta', () => {
    const onChange = vi.fn();
    render(<TrendArrowEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.change(screen.getByTestId(`${TID}-threshold`), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    fireEvent.change(screen.getByTestId(`${TID}-decimals`), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ decimals: 4 }));

    onChange.mockClear();
    clickSwitch(`${TID}-show-delta`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showDelta: false }));
  });

  it('CountryFlagEditor edits code field', () => {
    const onChange = vi.fn();
    render(<CountryFlagEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.change(screen.getByTestId(`${TID}-code-field`), { target: { value: 'US' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ codeField: 'US' }));
  });

  it('HeatmapEditor toggles mid colour on', () => {
    const onChange = vi.fn();
    render(<HeatmapEditor value={undefined} onChange={onChange} testId={TID} />);
    clickSwitch(`${TID}-mid-toggle`);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ colorScale: expect.objectContaining({ mid: expect.any(Object) }) }),
    );
  });

  it('TrendArrowEditor sets optional neutral colour', () => {
    const onChange = vi.fn();
    render(<TrendArrowEditor value={undefined} onChange={onChange} testId={TID} />);
    const dark = screen.getByTestId(`${TID}-neutral-dark`).querySelector('input')!;
    fireEvent.change(dark, { target: { value: '999999' } });
    fireEvent.blur(dark);
    expect(onChange).toHaveBeenCalled();
  });

  it('TrendArrowEditor clears neutral colour and keeps showDelta on', () => {
    const onChange = vi.fn();
    render(
      <TrendArrowEditor
        value={{ showDelta: true, neutralColor: { dark: '#999999' } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    const dark = screen.getByTestId(`${TID}-neutral-dark`).querySelector('input')!;
    fireEvent.change(dark, { target: { value: '' } });
    fireEvent.blur(dark);
    expect(onChange).toHaveBeenCalled();
  });

  it('MultiLineEditor edits secondary colour', () => {
    const onChange = vi.fn();
    render(<MultiLineEditor value={{ secondaryField: 'sub' }} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-secondary-color-dark`, '112233');
    expect(onChange).toHaveBeenCalled();
  });

  it('CountryFlagEditor clears code field and toggles show label', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CountryFlagEditor value={{ codeField: 'US' }} onChange={onChange} testId={TID} />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-code-field`), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ codeField: undefined }));

    onChange.mockClear();
    rerender(<CountryFlagEditor value={{ showLabel: true }} onChange={onChange} testId={TID} />);
    clickSwitch(`${TID}-show-label`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showLabel: false }));
  });

  it('HeatmapEditor edits domain max and clears domain', () => {
    const onChange = vi.fn();
    render(
      <HeatmapEditor
        value={{ colorScale: { min: { dark: '#1', light: '#2' }, max: { dark: '#3', light: '#4' } }, domain: { min: 0, max: 50 } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-domain-max`), { target: { value: '99' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ domain: { min: 0, max: 99 } }));

    onChange.mockClear();
    clickSwitch(`${TID}-domain-toggle`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ domain: undefined }));
  });

  it('HeatmapEditor edits min/max/text colours', () => {
    const onChange = vi.fn();
    render(<HeatmapEditor value={undefined} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-min-dark`, '111111');
    commitHex(`${TID}-max-dark`, '222222');
    commitHex(`${TID}-text-dark`, '333333');
    expect(onChange).toHaveBeenCalled();
  });

  it('HeatmapEditor edits mid colour when three-stop gradient is on', () => {
    const onChange = vi.fn();
    render(
      <HeatmapEditor
        value={{ colorScale: { min: { dark: '#1', light: '#2' }, mid: { dark: '#3', light: '#4' }, max: { dark: '#5', light: '#6' } } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    commitHex(`${TID}-mid-dark`, 'ABCDEF');
    expect(onChange).toHaveBeenCalled();
  });

  it('RatingDeltaEditor edits up/down colours and rating value', () => {
    const onChange = vi.fn();
    render(
      <RatingDeltaEditor value={{ scale: ['AA'], previousField: 'prev' }} onChange={onChange} testId={TID} />,
    );
    commitHex(`${TID}-up-dark`, '112233');
    commitHex(`${TID}-down-dark`, '445566');
    fireEvent.change(screen.getByTestId(`${TID}-rating-0`), { target: { value: 'BBB' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('SparklineEditor switches bar variant and edits fill colour', () => {
    const onChange = vi.fn();
    render(<SparklineEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByText('Bar'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ variant: 'bar' }));

    onChange.mockClear();
    commitHex(`${TID}-fill-dark`, '778899');
    expect(onChange).toHaveBeenCalled();
  });

  it('SparklineEditor edits line colour', () => {
    const onChange = vi.fn();
    render(<SparklineEditor value={undefined} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-line-dark`, 'AABBCC');
    expect(onChange).toHaveBeenCalled();
  });

  it('PillEditor shows empty state and edits fallback colours', () => {
    const onChange = vi.fn();
    render(<PillEditor value={undefined} onChange={onChange} testId={TID} />);
    expect(screen.getByText(/No rules/i)).toBeTruthy();
    commitHex(`${TID}-default-bg-dark`, '778899');
    expect(onChange).toHaveBeenCalled();
  });

  it('PercentBarEditor edits literal max and track colour', () => {
    const onChange = vi.fn();
    render(<PercentBarEditor value={undefined} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-max-literal`));
    fireEvent.change(screen.getByTestId(`${TID}-max-value`), { target: { value: '250' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max: 250 }));

    onChange.mockClear();
    commitHex(`${TID}-track-dark`, 'CCCCCC');
    expect(onChange).toHaveBeenCalled();
  });

  it('PercentBarEditor edits bar colour', () => {
    const onChange = vi.fn();
    render(<PercentBarEditor value={undefined} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-bar-dark`, 'DDEEFF');
    expect(onChange).toHaveBeenCalled();
  });

  it('TimeSinceEditor edits refresh interval downward', () => {
    const onChange = vi.fn();
    render(<TimeSinceEditor value={{ refreshSec: 30 }} onChange={onChange} testId={TID} />);
    fireEvent.keyDown(screen.getByTestId(`${TID}-refresh`), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalled();
  });

  it('TrendArrowEditor edits up/down colours', () => {
    const onChange = vi.fn();
    render(<TrendArrowEditor value={undefined} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-up-dark`, '112233');
    commitHex(`${TID}-down-dark`, '445566');
    expect(onChange).toHaveBeenCalled();
  });

  it('AllocationBarEditor edits segment colour', () => {
    const onChange = vi.fn();
    render(
      <AllocationBarEditor
        value={{ segmentColorMap: { equity: { dark: '#111', light: '#222' } } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    commitHex(`${TID}-segment-0-color-dark`, 'AABBCC');
    expect(onChange).toHaveBeenCalled();
  });

  it('AllocationBarEditor shows empty state and turns legend off', () => {
    const onChange = vi.fn();
    render(
      <AllocationBarEditor value={{ segmentColorMap: {}, legend: true }} onChange={onChange} testId={TID} />,
    );
    expect(screen.getByText(/No segment colours/i)).toBeTruthy();

    onChange.mockClear();
    clickSwitch(`${TID}-legend`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ legend: false }));
  });

  it('IconTextEditor works without testId hooks', async () => {
    const onChange = vi.fn();
    render(<IconTextEditor value={{ position: 'right' }} onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByText('pick'));
    });
    fireEvent.click(screen.getByLabelText('Left'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ position: 'left' }));
  });

  it('PillEditor works without testId hooks', () => {
    const onChange = vi.fn();
    render(<PillEditor value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Add rule/i }));
    expect(onChange).toHaveBeenCalled();
  });

  it('RatingDeltaEditor works without testId hooks', () => {
    const onChange = vi.fn();
    render(<RatingDeltaEditor value={{ scale: ['AA'] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scale: ['AA', ''] }));
  });

  it('AllocationBarEditor renames one segment while keeping another', () => {
    const onChange = vi.fn();
    render(
      <AllocationBarEditor
        value={{
          segmentColorMap: {
            equity: { dark: '#111', light: '#222' },
            bond: { dark: '#333', light: '#444' },
          },
          legend: false,
        }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-segment-0-key`), { target: { value: 'stock' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentColorMap: expect.objectContaining({
          stock: expect.any(Object),
          bond: expect.any(Object),
        }),
      }),
    );

    onChange.mockClear();
    clickSwitch(`${TID}-legend`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ legend: true }));
  });

  it('IconTextEditor shows selected icon preview and searches with empty query', async () => {
    const iconId = Object.keys(MARKET_ICON_SVGS).sort()[0]!;
    render(
      <IconTextEditor
        value={{ iconId, iconSvg: MARKET_ICON_SVGS[iconId] ?? '', position: 'left' }}
        onChange={() => {}}
        testId={TID}
      />,
    );
    expect(screen.queryByText('—')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId(`${TID}-icon-trigger`));
    });
    fireEvent.change(screen.getByPlaceholderText('Search icons…'), { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByTestId(`${TID}-icon-${iconId}`)).toBeTruthy();
    });
  });

  it('PillEditor uses default pill shape and clears rule background', () => {
    let current: Parameters<typeof PillEditor>[0]['value'] = {
      rules: [{ value: 'Hold', bg: { dark: '#111', light: '#222' }, fg: { dark: '#333' } }],
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(<PillEditor value={current} onChange={onChange} testId={TID} />);
    expect(screen.getByTestId(`${TID}-shape-pill`)).toBeTruthy();

    clearColor(`${TID}-rule-0-bg-dark`);
    rerender(<PillEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-rule-0-bg-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: [expect.objectContaining({ bg: { dark: '#3b82f6' } })],
      }),
    );
  });

  it('RatingDeltaEditor falls back when down colour cleared', () => {
    let current: Parameters<typeof RatingDeltaEditor>[0]['value'] = {
      scale: ['AA'],
      downColor: { dark: '#111', light: '#222' },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <RatingDeltaEditor value={current} onChange={onChange} testId={TID} />,
    );
    clearColor(`${TID}-down-dark`);
    rerender(<RatingDeltaEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-down-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ downColor: { dark: '#ef4444' } }),
    );
  });

  it('AllocationBarEditor clears segment colour and skips taken keys when adding', () => {
    let current: Parameters<typeof AllocationBarEditor>[0]['value'] = {
      segmentColorMap: { 'segment-1': { dark: '#111', light: '#222' } },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <AllocationBarEditor value={current} onChange={onChange} testId={TID} />,
    );
    clearColor(`${TID}-segment-0-color-dark`);
    rerender(<AllocationBarEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-segment-0-color-light`);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ segmentColorMap: {} }));

    onChange.mockClear();
    current = { segmentColorMap: { 'segment-1': { dark: '#111', light: '#222' } } };
    rerender(<AllocationBarEditor value={current} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-add-segment`));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentColorMap: expect.objectContaining({ 'segment-2': expect.any(Object) }),
      }),
    );
  });

  it('CountryFlagEditor edits label field and toggles show label on', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CountryFlagEditor value={{ labelField: 'country' }} onChange={onChange} testId={TID} />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-label-field`), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ labelField: undefined }));

    onChange.mockClear();
    rerender(<CountryFlagEditor value={{ showLabel: false }} onChange={onChange} testId={TID} />);
    clickSwitch(`${TID}-show-label`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showLabel: true }));
  });

  it('HeatmapEditor clears text colour and falls back when min cleared', () => {
    let current: Parameters<typeof HeatmapEditor>[0]['value'] = {
      colorScale: { min: { dark: '#111', light: '#222' }, max: { dark: '#333', light: '#444' } },
      textColor: { dark: '#555' },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <HeatmapEditor value={current} onChange={onChange} testId={TID} />,
    );
    clearColor(`${TID}-text-dark`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ textColor: undefined }));

    onChange.mockClear();
    rerender(<HeatmapEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-min-dark`);
    rerender(<HeatmapEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-min-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        colorScale: expect.objectContaining({ min: { dark: '#1e3a8a' } }),
      }),
    );
  });

  it('IconTextEditor switches to left position and clears icon colour', () => {
    const onChange = vi.fn();
    render(
      <IconTextEditor
        value={{ iconId: '', iconSvg: '', position: 'right', iconColor: { dark: '#111' } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByTestId(`${TID}-pos-left`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ position: 'left' }));

    onChange.mockClear();
    clearColor(`${TID}-icon-color-dark`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iconColor: undefined }));
  });

  it('PercentBarEditor switches max to literal and mutual-excludes show flags', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PercentBarEditor value={{ max: { fromField: 'cap' }, showValue: true }} onChange={onChange} testId={TID} />,
    );
    fireEvent.click(screen.getByTestId(`${TID}-max-literal`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max: 100 }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId(`${TID}-show-percent`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showPercent: true, showValue: false }));

    onChange.mockClear();
    rerender(<PercentBarEditor value={{ showPercent: true }} onChange={onChange} testId={TID} />);
    fireEvent.click(screen.getByTestId(`${TID}-show-value`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showValue: true, showPercent: false }));
  });

  it('PercentBarEditor falls back when bar colour cleared', () => {
    let current: Parameters<typeof PercentBarEditor>[0]['value'] = {
      barColor: { dark: '#111', light: '#222' },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <PercentBarEditor value={current} onChange={onChange} testId={TID} />,
    );
    clearColor(`${TID}-bar-dark`);
    rerender(<PercentBarEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-bar-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ barColor: { dark: '#3b82f6' } }),
    );
  });

  it('PillEditor switches to pill shape and edits rule foreground', () => {
    const onChange = vi.fn();
    render(
      <PillEditor
        value={{ shape: 'square', rules: [{ value: 'Buy', bg: { dark: '#1', light: '#2' } }] }}
        onChange={onChange}
        testId={TID}
      />,
    );
    fireEvent.click(screen.getByTestId(`${TID}-shape-pill`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shape: 'pill' }));

    onChange.mockClear();
    commitHex(`${TID}-rule-0-fg-dark`, 'AABBCC');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ rules: [expect.objectContaining({ fg: { dark: '#AABBCC' } })] }),
    );
  });

  it('PillEditor edits default foreground colour', () => {
    const onChange = vi.fn();
    render(<PillEditor value={undefined} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-default-fg-dark`, '112233');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ fallback: expect.objectContaining({ fg: { dark: '#112233' } }) }),
    );
  });

  it('RatingDeltaEditor renders the default S&P scale', () => {
    render(<RatingDeltaEditor value={undefined} onChange={() => {}} testId={TID} />);
    expect(screen.getByTestId(`${TID}-rating-0`)).toBeTruthy();
    expect(screen.getByTestId(`${TID}-rating-21`)).toBeTruthy();
  });

  it('RatingDeltaEditor falls back when up colour cleared', () => {
    const onChange = vi.fn();
    render(
      <RatingDeltaEditor
        value={{ scale: ['AA'], upColor: { dark: '#111' }, downColor: { dark: '#222' } }}
        onChange={onChange}
        testId={TID}
      />,
    );
    clearColor(`${TID}-up-dark`);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ upColor: { dark: '#22c55e' } }),
    );
  });

  it('SparklineEditor switches back to line and falls back when line colour cleared', () => {
    let current: Parameters<typeof SparklineEditor>[0]['value'] = {
      variant: 'area',
      lineColor: { dark: '#111', light: '#222' },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <SparklineEditor value={current} onChange={onChange} testId={TID} />,
    );
    fireEvent.click(screen.getByText('Line'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ variant: 'line' }));

    onChange.mockClear();
    rerender(<SparklineEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-line-dark`);
    rerender(<SparklineEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-line-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lineColor: { dark: '#22c55e' } }),
    );
  });

  it('TimeSinceEditor edits future colour and default refresh interval', () => {
    const onChange = vi.fn();
    render(<TimeSinceEditor value={{}} onChange={onChange} testId={TID} />);
    commitHex(`${TID}-future-color-dark`, '445566');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ futureColor: { dark: '#445566' } }),
    );

    onChange.mockClear();
    fireEvent.keyDown(screen.getByTestId(`${TID}-refresh`), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refreshSec: 61 }));
  });

  it('TrendArrowEditor normalises empty numeric fields and turns showDelta on', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TrendArrowEditor value={{ threshold: 1, decimals: 3 }} onChange={onChange} testId={TID} />,
    );
    fireEvent.change(screen.getByTestId(`${TID}-threshold`), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0 }));

    onChange.mockClear();
    fireEvent.change(screen.getByTestId(`${TID}-decimals`), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ decimals: 0 }));

    onChange.mockClear();
    rerender(<TrendArrowEditor value={{ showDelta: false }} onChange={onChange} testId={TID} />);
    clickSwitch(`${TID}-show-delta`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showDelta: true }));
  });

  it('TrendArrowEditor falls back when directional colours cleared', () => {
    let current: Parameters<typeof TrendArrowEditor>[0]['value'] = {
      upColor: { dark: '#111', light: '#222' },
    };
    const onChange = vi.fn((next) => {
      current = next;
    });
    const { rerender } = render(
      <TrendArrowEditor value={current} onChange={onChange} testId={TID} />,
    );
    clearColor(`${TID}-up-dark`);
    rerender(<TrendArrowEditor value={current} onChange={onChange} testId={TID} />);
    clearColor(`${TID}-up-light`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ upColor: { dark: '#22c55e' } }),
    );
  });
});
