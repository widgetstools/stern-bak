/** Cell data types supported by bulk update (text, number, date). */
export function isBulkUpdateCellType(cellDataType: string | undefined): boolean {
  if (!cellDataType) return true;
  switch (cellDataType) {
    case 'text':
    case 'number':
    case 'date':
    case 'dateString':
    case 'dateTime':
    case 'dateTimeString':
      return true;
    default:
      return false;
  }
}

export type BulkUpdateValueKind = 'text' | 'number' | 'date';

export function bulkUpdateValueKind(cellDataType: string | undefined): BulkUpdateValueKind {
  if (cellDataType === 'number') return 'number';
  if (
    cellDataType === 'date'
    || cellDataType === 'dateString'
    || cellDataType === 'dateTime'
    || cellDataType === 'dateTimeString'
  ) {
    return 'date';
  }
  return 'text';
}
