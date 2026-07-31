export interface RowShape {
  id: string;
  cusip: string;
  issuer: string;
  sector: string;
  price: number;
  yield: number;
  bidPrice: number;
  askPrice: number;
}

export const GRID_ID = 'browser-blotter-v1';
