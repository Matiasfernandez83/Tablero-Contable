export interface ArcaRow {
  fecha: string;
  tipoComprobante: string;
  puntoVenta: string;
  numero: string;
  cuit: string;
  denominacion: string;
  neto105: number;
  iva105: number;
  neto21: number;
  iva21: number;
  neto27: number;
  iva27: number;
  netoTotal: number;
  ivaTotal: number;
  importeTotal: number;
}

export interface ArcaSummary {
  puntoVenta: string;
  tipoComprobante: string;
  neto105: number;
  iva105: number;
  neto21: number;
  iva21: number;
  neto27: number;
  iva27: number;
  netoTotal: number;
  ivaTotal: number;
  importeTotal: number;
  cantidad: number;
}

export interface RawCsvRow {
  [key: string]: string;
}
