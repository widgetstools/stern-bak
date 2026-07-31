/** Stable AG Grid cell-class / excelStyle id for an Excel format string. */
export function formatExcelClassId(format: string): string {
  let hash = 0;
  for (let i = 0; i < format.length; i++) {
    hash = ((hash << 5) - hash + format.charCodeAt(i)) | 0;
  }
  return `ds-xls-fmt-${Math.abs(hash).toString(36)}`;
}
