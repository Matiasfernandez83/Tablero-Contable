import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileText, 
  Upload, 
  LayoutDashboard, 
  Users, 
  Settings, 
  Download, 
  Filter, 
  Search, 
  AlertCircle,
  X,
  Maximize2,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, formatID } from './lib/utils';
import { ArcaRow, ArcaSummary, RawCsvRow } from './types';

export default function App() {
  const [data, setData] = useState<ArcaRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPuntoVenta, setFilterPuntoVenta] = useState<string[]>([]);
  const [filterTipoComprobante, setFilterTipoComprobante] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [drillDownData, setDrillDownData] = useState<{ title: string; rows: ArcaRow[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseArFloat = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/\$|\s/g, '');
    if (clean.includes('.') && clean.includes(',')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    }
    if (clean.includes(',')) {
      return parseFloat(clean.replace(',', '.'));
    }
    return parseFloat(clean) || 0;
  };

  const processRows = (rawRows: any[]) => {
    const rows: ArcaRow[] = rawRows
      .filter(row => row['Fecha'] || row['Tipo'] || row['Tipo de Comprobante'])
      .map(row => {
        // Helper to find column keys regardless of spaces or case
        const getColumnValue = (aliases: string[]) => {
          const actualKey = Object.keys(row).find(key => 
            aliases.some(alias => key.trim().toLowerCase() === alias.toLowerCase())
          );
          return actualKey ? row[actualKey] : undefined;
        };

        const tipoCompOriginal = String(getColumnValue(['Tipo', 'Tipo de Comprobante']) || 'Desconocido');
        const tipoCompLower = tipoCompOriginal.toLowerCase();
        
        // Identificar Notas de Crédito para restar
        const isNC = tipoCompLower.includes('nota de crédito') || 
                     tipoCompLower.includes('nota de credito') || 
                     tipoCompLower.includes('n.créd') || 
                     tipoCompLower.includes('n.cred') ||
                     tipoCompLower.includes('nc ');
        const multiplier = isNC ? -1 : 1;

        // Mapeo robusto de columnas basado en formatos AFIP y la imagen provista
        const neto21 = parseArFloat(getColumnValue(['Imp. Neto Gravado', 'Neto 21%', 'Imp. Neto Gravado IVA 21%', 'Imp. Neto Gravado (21%)']) || '0') * multiplier;
        const iva21 = parseArFloat(getColumnValue(['Imp. IVA', 'IVA 21%', 'Importe IVA', 'IVA (21%)']) || '0') * multiplier;
        
        // Se añade 'Imp. Neto Gravado IVA 10,5%' específicamente por la imagen del usuario
        const neto105 = parseArFloat(getColumnValue([
          'Imp. Neto Gravado IVA 10,5%', 
          'Imp. Neto Gravado (10,5%)', 
          'Neto Gravado IVA 10,5%', 
          'Neto 10,5%', 
          'Neto 10.5%', 
          'Neto Gravado 10,5%', 
          'Importe Neto 10,5%'
        ]) || '0') * multiplier;
        const iva105 = parseArFloat(getColumnValue(['IVA 10,5%', 'IVA 10.5%', 'IVA (10,5%)']) || '0') * multiplier;
        
        const neto27 = parseArFloat(getColumnValue(['Neto 27%', 'Neto Gravado IVA 27%', 'Imp. Neto Gravado (27%)']) || '0') * multiplier;
        const iva27 = parseArFloat(getColumnValue(['IVA 27%', 'IVA (27%)']) || '0') * multiplier;
        
        const netoTotal = neto21 + neto105 + neto27;
        const ivaTotal = iva21 + iva105 + iva27;
        const totalExcel = parseArFloat(getColumnValue(['Imp. Total', 'Importe Total']) || '0');
        const total = totalExcel !== 0 ? totalExcel * multiplier : (netoTotal + ivaTotal);

        return {
          fecha: getColumnValue(['Fecha']) || '',
          tipoComprobante: tipoCompOriginal,
          puntoVenta: String(getColumnValue(['Punto de Venta', 'Pto. Vta']) || '0'),
          numero: getColumnValue(['Número Desde', 'Número']) || '',
          cuit: getColumnValue(['CUIT Emisor', 'CUIT Receptor', 'Nro. Doc. Receptor']) || '',
          denominacion: getColumnValue(['Denominación Emisor', 'Denominación Receptor']) || '',
          neto105,
          iva105,
          neto21,
          iva21,
          neto27,
          iva27,
          netoTotal,
          ivaTotal,
          importeTotal: total
        };
      });

    setData(rows);
    setIsLoading(false);
  };

  const handleFileUpload = (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        processRows(json);
      };
      reader.readAsArrayBuffer(file);
    } else if (extension === 'csv' || extension === 'txt') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processRows(results.data),
        error: (err) => {
          console.error(err);
          setIsLoading(false);
        }
      });
    } else {
      alert('Formato de archivo no soportado. Use .csv, .txt o Excel.');
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesPV = filterPuntoVenta.length === 0 || filterPuntoVenta.includes(row.puntoVenta);
      const matchesTipo = filterTipoComprobante.length === 0 || filterTipoComprobante.includes(row.tipoComprobante);
      const matchesSearch = searchTerm === '' || row.tipoComprobante.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesPV && matchesTipo && matchesSearch;
    });
  }, [data, filterPuntoVenta, filterTipoComprobante, searchTerm]);

  const summary = useMemo(() => {
    const groups: Record<string, ArcaSummary> = {};

    filteredData.forEach(row => {
      const key = `${row.puntoVenta}-${row.tipoComprobante}`;
      if (!groups[key]) {
        groups[key] = {
          puntoVenta: row.puntoVenta,
          tipoComprobante: row.tipoComprobante,
          neto105: 0,
          iva105: 0,
          neto21: 0,
          iva21: 0,
          neto27: 0,
          iva27: 0,
          netoTotal: 0,
          ivaTotal: 0,
          importeTotal: 0,
          cantidad: 0
        };
      }
      
      const g = groups[key];
      g.neto105 += row.neto105;
      g.iva105 += row.iva105;
      g.neto21 += row.neto21;
      g.iva21 += row.iva21;
      g.neto27 += row.neto27;
      g.iva27 += row.iva27;
      g.netoTotal += row.netoTotal;
      g.ivaTotal += row.ivaTotal;
      g.importeTotal += row.importeTotal;
      g.cantidad += 1;
    });

    return Object.values(groups);
  }, [filteredData]);

  const totals = useMemo(() => {
    return summary.reduce((acc, curr) => ({
      neto105: acc.neto105 + curr.neto105,
      iva105: acc.iva105 + curr.iva105,
      neto21: acc.neto21 + curr.neto21,
      iva21: acc.iva21 + curr.iva21,
      neto27: acc.neto27 + curr.neto27,
      iva27: acc.iva27 + curr.iva27,
      netoTotal: acc.netoTotal + curr.netoTotal,
      ivaTotal: acc.ivaTotal + curr.ivaTotal,
      importeTotal: acc.importeTotal + curr.importeTotal,
      cantidad: acc.cantidad + curr.cantidad,
    }), {
      neto105: 0, iva105: 0, neto21: 0, iva21: 0, neto27: 0, iva27: 0, netoTotal: 0, ivaTotal: 0, importeTotal: 0, cantidad: 0
    });
  }, [summary]);

  const uniquePVs = useMemo(() => Array.from(new Set(data.map(d => d.puntoVenta))).sort(), [data]);
  const uniqueTipos = useMemo(() => Array.from(new Set(data.map(d => d.tipoComprobante))).sort(), [data]);

  const togglePVFilter = (pv: string) => {
    setFilterPuntoVenta(prev => prev.includes(pv) ? prev.filter(p => p !== pv) : [...prev, pv]);
  };

  const toggleTipoFilter = (tipo: string) => {
    setFilterTipoComprobante(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  };

  const handleDeleteRecords = (puntoVenta?: string, tipoComprobante?: string) => {
    // Si no hay argumentos, es el botón "Limpiar Todo"
    if (!puntoVenta && !tipoComprobante) {
      setData([]);
      setFileName('');
      setFilterPuntoVenta([]);
      setFilterTipoComprobante([]);
      setSearchTerm('');
      return;
    }

    // Borrado por línea (aunque se pide quitar, lo mantengo interno por seguridad de lógica, pero se quita del UI)
    setData(prev => prev.filter(row => 
      !(row.puntoVenta === puntoVenta && row.tipoComprobante === tipoComprobante)
    ));
  };

  const handleExportExcel = () => {
    if (summary.length === 0) return;
    const exportData = summary.map(s => ({
      'PV': formatID(s.puntoVenta),
      'Tipo Comprobante': s.tipoComprobante,
      'Neto 10.5%': s.neto105,
      'IVA 10.5%': s.iva105,
      'Neto 21%': s.neto21,
      'IVA 21%': s.iva21,
      'Neto 27%': s.neto27,
      'IVA 27%': s.iva27,
      'Total Neto': s.netoTotal,
      'Total IVA': s.ivaTotal,
      'Importe Total': s.importeTotal
    }));
    
    // Add Total Row
    exportData.push({
      'PV': 'TOTAL',
      'Tipo Comprobante': 'GENERAL',
      'Neto 10.5%': totals.neto105,
      'IVA 10.5%': totals.iva105,
      'Neto 21%': totals.neto21,
      'IVA 21%': totals.iva21,
      'Neto 27%': totals.neto27,
      'IVA 27%': totals.iva27,
      'Total Neto': totals.netoTotal,
      'Total IVA': totals.ivaTotal,
      'Importe Total': totals.importeTotal
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen");
    XLSX.writeFile(workbook, `Resumen_ARCA_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPdf = () => {
    if (summary.length === 0) return;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text("Resumen Contable ARCA - Dashboard", 14, 15);
    doc.setFontSize(9);
    doc.text(`Archivo: ${fileName || 'N/A'}`, 14, 22);
    doc.text(`Fecha de Exportación: ${new Date().toLocaleString()}`, 14, 27);
    
    const tableData = summary.map(row => [
      formatID(row.puntoVenta),
      row.tipoComprobante,
      formatCurrency(row.neto105),
      formatCurrency(row.iva105),
      formatCurrency(row.neto21),
      formatCurrency(row.iva21),
      formatCurrency(row.neto27),
      formatCurrency(row.iva27),
      formatCurrency(row.netoTotal),
      formatCurrency(row.ivaTotal),
      formatCurrency(row.importeTotal)
    ]);

    // Add totals row
    tableData.push([
      'TOTAL',
      'GENERAL',
      formatCurrency(totals.neto105),
      formatCurrency(totals.iva105),
      formatCurrency(totals.neto21),
      formatCurrency(totals.iva21),
      formatCurrency(totals.neto27),
      formatCurrency(totals.iva27),
      formatCurrency(totals.netoTotal),
      formatCurrency(totals.ivaTotal),
      formatCurrency(totals.importeTotal)
    ]);

    autoTable(doc, {
      startY: 32,
      head: [['PV', 'Tipo Comprobante', 'Neto 10.5', 'IVA 10.5', 'Neto 21', 'IVA 21', 'Neto 27', 'IVA 27', 'Tot. Neto', 'Tot. IVA', 'Imp. Total']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 7, halign: 'right' },
      columnStyles: { 
        0: { halign: 'left' },
        1: { halign: 'left' }
      },
      headStyles: { fillColor: [44, 82, 130], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' }
    });

    doc.save(`Resumen_ARCA_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="flex h-screen w-full select-none">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[var(--sidebar-bg)] text-white flex flex-col p-5 shrink-0">
        <div className="flex items-center gap-2 font-bold tracking-wider text-sm border-b border-[#333] pb-4 mb-6">
          <FileText size={18} className="text-[#2c5282]" />
          ARCA ANALYZER v2.0
        </div>
        
        <nav className="flex flex-col gap-1">
          <button className="flex items-center gap-3 py-3 px-3 text-[13px] text-white border-l-3 border-[var(--accent)] bg-white/5 rounded-r">
            <LayoutDashboard size={14} />
            Dashboard de Datos
          </button>
          <button className="flex items-center gap-3 py-3 px-3 text-[13px] text-[#aaa] hover:text-white hover:bg-white/5 transition-colors">
            <Download size={14} />
            Exportar Reportes
          </button>
        </nav>

        <div className="mt-auto pt-4 border-t border-[#333] text-[10px] text-[#555] uppercase tracking-widest font-semibold flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          Contador Argerich
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col p-6 overflow-hidden">
        <header className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[#333] mb-1">Panel de Resumen Contable</h1>
            <p className="text-[12px] text-[var(--text-muted)] flex items-center gap-2">
              {data.length > 0 ? (
                <>
                  <span className="font-bold text-[#141414]">Archivo:</span> {fileName} 
                  <span className="px-2">|</span>
                  <span className="font-bold text-[#141414]">Total Registros:</span> {data.length}
                </>
              ) : (
                "Carga archivos Excel (.xlsx/.xls), CSV o TXT para analizar."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {data.length > 0 && (
              <>
                <button 
                  onClick={() => handleDeleteRecords()}
                  className="px-4 py-2 border border-red-200 text-red-600 text-[13px] font-medium rounded flex items-center gap-2 hover:bg-red-50 transition-all shadow-sm mr-2"
                  title="Borrar todos los registros"
                >
                  <Trash2 size={14} />
                  Limpiar Todo
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-700 text-white text-[13px] font-medium rounded flex items-center gap-2 hover:bg-green-800 transition-all shadow-sm"
                  title="Descargar Excel"
                >
                  <Download size={14} />
                  Excel
                </button>
                <button 
                  onClick={handleExportPdf}
                  className="px-4 py-2 bg-red-700 text-white text-[13px] font-medium rounded flex items-center gap-2 hover:bg-red-800 transition-all shadow-sm"
                  title="Descargar PDF"
                >
                  <FileText size={14} />
                  PDF
                </button>
              </>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[var(--accent)] text-white text-[13px] font-medium rounded flex items-center gap-2 hover:bg-[#1e3a5a] transition-all shadow-sm"
            >
              <Upload size={14} />
              Cargar Archivo Multi-formato
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv,.txt,.xlsx,.xls,.xlsm" 
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </div>
        </header>

        {/* Global Summary Metrics Grid */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <KPICard 
            label="IVA 10.5%" 
            value={formatCurrency(totals.iva105)} 
            onClick={() => setDrillDownData({ title: 'Detalle IVA 10.5%', rows: filteredData.filter(r => r.iva105 !== 0) })}
          />
          <KPICard 
            label="IVA 21%" 
            value={formatCurrency(totals.iva21)} 
            onClick={() => setDrillDownData({ title: 'Detalle IVA 21%', rows: filteredData.filter(r => r.iva21 !== 0) })}
          />
          <KPICard 
            label="IVA 27%" 
            value={formatCurrency(totals.iva27)} 
            onClick={() => setDrillDownData({ title: 'Detalle IVA 27%', rows: filteredData.filter(r => r.iva27 !== 0) })}
          />
          <KPICard 
            label="Neto 10.5%" 
            value={formatCurrency(totals.neto105)} 
            onClick={() => setDrillDownData({ title: 'Detalle Neto 10.5%', rows: filteredData.filter(r => r.neto105 !== 0) })}
          />
          <KPICard 
            label="Neto 21%" 
            value={formatCurrency(totals.neto21)} 
            onClick={() => setDrillDownData({ title: 'Detalle Neto 21%', rows: filteredData.filter(r => r.neto21 !== 0) })}
          />
          <KPICard 
            label="Neto 27%" 
            value={formatCurrency(totals.neto27)} 
            onClick={() => setDrillDownData({ title: 'Detalle Neto 27%', rows: filteredData.filter(r => r.neto27 !== 0) })}
          />
        </div>

        {/* Filters Multi-Select Bar */}
        <div className="flex flex-col gap-3 p-4 bg-[#eee] border border-[var(--line)] text-[12px] mb-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 mr-2">
              <Filter size={12} className="text-[#888]" />
              <span className="font-bold uppercase tracking-tight text-[#444]">Filtros Dinámicos:</span>
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
              <DropdownFilter 
                label="Puntos de Venta" 
                options={uniquePVs} 
                selected={filterPuntoVenta} 
                onToggle={togglePVFilter} 
                formatOption={(o) => `PV ${formatID(o)}`}
              />
              <DropdownFilter 
                label="Tipo Comprobante" 
                options={uniqueTipos} 
                selected={filterTipoComprobante} 
                onToggle={toggleTipoFilter} 
              />
            </div>

            <div className="ml-auto flex items-center gap-2 bg-white border border-[var(--line)] rounded-full px-3 py-1 shadow-inner">
              <Search size={12} className="text-[#888]" />
              <input 
                type="text" 
                placeholder="Buscar tipo..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none focus:outline-none w-[150px] text-[11px]"
              />
            </div>
          </div>
          
          {/* Active Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {filterPuntoVenta.map(pv => (
              <FilterChip key={pv} label={`PV ${formatID(pv)}`} onRemove={() => togglePVFilter(pv)} />
            ))}
            {filterTipoComprobante.map(tipo => (
              <FilterChip key={tipo} label={tipo} onRemove={() => toggleTipoFilter(tipo)} />
            ))}
            {(filterPuntoVenta.length > 0 || filterTipoComprobante.length > 0) && (
              <button 
                onClick={() => { setFilterPuntoVenta([]); setFilterTipoComprobante([]); }}
                className="text-[10px] text-red-600 font-bold hover:underline"
              >
                LIMPIAR TODOS
              </button>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-grow bg-white border border-[var(--line)] overflow-hidden flex flex-col relative group">
          <AnimatePresence mode="wait">
            {data.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center flex-grow p-12 text-center"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
              >
                <div className={cn(
                  "border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer",
                  isDragging ? "border-[var(--accent)] bg-blue-50/50 scale-105" : "border-[#e0e0e0] hover:border-[var(--line)]"
                )}>
                  <Upload className={cn("mx-auto h-12 w-12 mb-4", isDragging ? "text-[var(--accent)] animate-bounce" : "text-gray-300")} />
                  <p className="text-sm font-medium text-gray-900">Arrastra archivos Excel, CSV o TXT aquí</p>
                  <p className="text-xs text-gray-500 mt-1">Detección automática de columnas contables</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="data"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col h-full"
              >
                <div className="overflow-auto flex-grow">
                  <table className="w-full border-collapse text-[10px] table-fixed min-w-[1200px]">
                    <thead className="sticky top-0 z-10 bg-[#f8f8f8] border-b-2 border-[var(--line)] shadow-sm">
                      <tr>
                        <th className="w-[50px] text-left p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">PV</th>
                        <th className="text-left p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Tipo Comprobante</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Neto 10.5%</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">IVA 10.5%</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Neto 21%</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">IVA 21%</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Neto 27%</th>
                        <th className="w-[85px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">IVA 27%</th>
                        <th className="w-[95px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Tot. Neto</th>
                        <th className="w-[95px] text-right p-2 font-semibold text-[var(--text-muted)] border-r border-[#eee]">Tot. IVA</th>
                        <th className="w-[110px] text-right p-2 font-semibold text-[var(--text-muted)]">Imp. Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee]">
                      {summary.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors odd:bg-white even:bg-[#fafafa]">
                          <td className="p-2 border-r border-[#eee] mono-tabular">{formatID(row.puntoVenta)}</td>
                          <td className="p-2 border-r border-[#eee] font-medium text-[#444] truncate" title={row.tipoComprobante}>
                            {row.tipoComprobante}
                          </td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.neto105)}</td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.iva105)}</td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.neto21)}</td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.iva21)}</td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.neto27)}</td>
                          <td className="p-2 border-r border-[#eee] text-right mono-tabular">{formatCurrency(row.iva27)}</td>
                          <td className="p-2 border-r border-[#eee] text-right font-semibold bg-gray-50 mono-tabular">{formatCurrency(row.netoTotal)}</td>
                          <td className="p-2 border-r border-[#eee] text-right font-semibold bg-gray-50 mono-tabular">{formatCurrency(row.ivaTotal)}</td>
                          <td className="p-2 text-right font-bold text-[#1a1a1a] mono-tabular">{formatCurrency(row.importeTotal)}</td>
                        </tr>
                      ))}
                      
                      {/* Global Summary Bottom Row */}
                      <tr className="bg-[#f2f2f2] border-t-2 border-[var(--line)] font-bold sticky bottom-0 z-10">
                        <td className="p-2 border-r border-gray-200">TOTAL</td>
                        <td className="p-2 border-r border-gray-200 uppercase">General</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.neto105)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.iva105)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.neto21)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.iva21)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.neto27)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.iva27)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.netoTotal)}</td>
                        <td className="p-2 text-right border-r border-gray-200 mono-tabular">{formatCurrency(totals.ivaTotal)}</td>
                        <td className="p-2 text-right mono-tabular text-[var(--accent)]">{formatCurrency(totals.importeTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="mt-4 flex justify-between items-center text-[10px] text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <AlertCircle size={10} />
            Mapeo extendido para tasas de 10.5%, 21% y 27%. Haz clic en las tarjetas de arriba para ver el detalle (drill-down).
          </div>
          <div className="italic font-mono uppercase tracking-widest opacity-60">
            Último procesamiento: {new Date().toLocaleString('es-AR')}
          </div>
        </footer>
      </main>

      {/* Drill Down Modal */}
      <AnimatePresence>
        {drillDownData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-6xl h-full flex flex-col shadow-2xl rounded-lg overflow-hidden"
            >
              <div className="p-5 border-b flex justify-between items-center bg-[var(--sidebar-bg)] text-white">
                <div className="flex items-center gap-3">
                  <Maximize2 size={18} />
                  <h2 className="text-lg font-bold uppercase tracking-tight">{drillDownData.title}</h2>
                  <span className="text-[12px] opacity-60">({drillDownData.rows.length} registros)</span>
                </div>
                <button 
                  onClick={() => setDrillDownData(null)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-grow overflow-auto p-4 bg-gray-50">
                <table className="w-full border-collapse text-[10px] bg-white border">
                  <thead className="sticky top-0 bg-gray-200 font-bold border-b-2">
                    <tr>
                      <th className="p-2 text-left border-r w-[80px]">Fecha</th>
                      <th className="p-2 text-left border-r w-[120px]">Comprobante</th>
                      <th className="p-2 text-left border-r w-[60px]">PV</th>
                      <th className="p-2 text-left border-r w-[120px]">CUIT</th>
                      <th className="p-2 text-left border-r">Denominación</th>
                      <th className="p-2 text-right border-r w-[100px]">Neto</th>
                      <th className="p-2 text-right border-r w-[100px]">IVA</th>
                      <th className="p-2 text-right w-[110px]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drillDownData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50 transition-colors">
                        <td className="p-2 border-r">{row.fecha}</td>
                        <td className="p-2 border-r truncate">{row.tipoComprobante}</td>
                        <td className="p-2 border-r text-center">{formatID(row.puntoVenta)}</td>
                        <td className="p-2 border-r mono-tabular tracking-tighter">{row.cuit}</td>
                        <td className="p-2 border-r truncate max-w-[200px]">{row.denominacion}</td>
                        <td className="p-2 border-r text-right mono-tabular">{formatCurrency(row.netoTotal)}</td>
                        <td className="p-2 border-r text-right mono-tabular">{formatCurrency(row.ivaTotal)}</td>
                        <td className="p-2 text-right font-bold mono-tabular">{formatCurrency(row.importeTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 border-t bg-gray-100 flex justify-end">
                <button 
                  onClick={() => setDrillDownData(null)}
                  className="px-6 py-2 bg-[var(--sidebar-bg)] text-white text-sm font-bold rounded hover:opacity-90"
                >
                  CERRAR VISTA DETALLADA
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropdownFilter({ label, options, selected, onToggle, formatOption }: { 
  label: string, 
  options: string[], 
  selected: string[], 
  onToggle: (o: string) => void,
  formatOption?: (o: string) => string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-3 py-1.5 bg-white border rounded flex items-center gap-2 transition-all",
          selected.length > 0 ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--line)]"
        )}
      >
        <span className="font-medium text-[#555]">{label}</span>
        {selected.length > 0 && (
          <span className="bg-[var(--accent)] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {selected.length}
          </span>
        )}
        <ChevronRight size={12} className={cn("transition-transform", isOpen && "rotate-90")} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-white border border-[var(--line)] shadow-xl rounded z-20 max-h-[300px] overflow-auto p-1">
            <div className="p-2 border-b text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Selección Múltiple
            </div>
            {options.map(opt => (
              <label 
                key={opt} 
                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  type="checkbox" 
                  checked={selected.includes(opt)} 
                  onChange={() => onToggle(opt)}
                  className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <span className="truncate text-[#444]">{formatOption ? formatOption(opt) : opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string, onRemove: () => void, key?: React.Key }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-[var(--accent)] text-[var(--accent)] rounded font-medium shadow-sm">
      <span className="truncate max-w-[150px]">{label}</span>
      <button onClick={onRemove} className="hover:bg-red-50 rounded shrink-0">
        <X size={10} />
      </button>
    </div>
  );
}

function KPICard({ label, value, onClick }: { label: string, value: string, onClick?: () => void, key?: React.Key }) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        "bg-[var(--white)] p-3 border border-[var(--line)] shadow-sm cursor-pointer group transition-all relative overflow-hidden",
        "hover:border-[var(--accent)] hover:shadow-md"
      )}
    >
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1">
        {label}
      </div>
      <div className="text-[14px] font-bold font-mono tracking-tight text-[#141414] group-hover:text-[var(--accent)] transition-colors">
        {value}
      </div>
      <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-40 transition-opacity">
        <Maximize2 size={12} />
      </div>
    </motion.div>
  );
}
