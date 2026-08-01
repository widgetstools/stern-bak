/** AG Grid cellDataType values treated as numeric for smart edit. */
export function isNumericCellDataType(cellDataType: string | undefined): boolean {
  if (!cellDataType) return false;
  const t = cellDataType.toLowerCase();
  return t === 'number' || t === 'numeric';
}
