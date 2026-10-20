import { useState, useMemo } from 'react';
import { Download, Printer, CheckCircle, FileText } from 'lucide-react';
import { useClasses, useStudents, useAttendance, useSchoolInfo, useWaliKelas } from '@/lib/queries';
import { cn, formatShortDate, formatDate } from '@/lib/utils';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type FilterStatus = 'ALL' | 'Sakit' | 'Izin' | 'Alpa';

export default function RekapHarian() {
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('ALL');

  const { data: classes = [] } = useClasses();
  const { data: students = [] } = useStudents();
  const { data: attendance = [], isLoading } = useAttendance(selectedDate);
  const { data: schoolInfo } = useSchoolInfo();
  const { data: waliKelasList = [] } = useWaliKelas();

  const waliMap = useMemo(() => {
    const map: Record<string, string> = {};
    waliKelasList.forEach(w => {
      if (w.kelas && w.nama) {
        map[w.kelas.trim()] = w.nama.trim();
      }
    });
    return map;
  }, [waliKelasList]);

  const filteredData = useMemo(() => {
    let result = students;
    if (selectedClass !== 'ALL') {
      result = result.filter(s => s.kelas === selectedClass);
    }
    
    // Map with attendance
    const attendanceMap = new Map(attendance.map(a => [a.student_id, a]));
    
    const enriched = result.map(s => ({
      ...s,
      record: attendanceMap.get(s.id) || null
    }));

    // Rekap harian only shows absent students (S/I/A). 'ALL' means all absent statuses.
    return enriched.filter(item => {
      const status = item.record?.status;
      if (!status || status === 'Hadir') return false; // always hide Hadir
      if (selectedStatus === 'ALL') return true; // show all S/I/A
      return status === selectedStatus;
    });
  }, [students, attendance, selectedClass, selectedStatus]);

  const stats = useMemo(() => {
    let sakit = 0, izin = 0, alpa = 0;
    
    // Base stats on the filtered class students, not just the currently displayed list
    const classStudents = selectedClass === 'ALL' ? students : students.filter(s => s.kelas === selectedClass);
    const attendanceMap = new Map(attendance.map(a => [a.student_id, a]));
    
    classStudents.forEach(s => {
      const status = attendanceMap.get(s.id)?.status;
      if (status === 'Sakit') sakit++;
      else if (status === 'Izin') izin++;
      else if (status === 'Alpa') alpa++;
    });
    
    return { 
      total: sakit + izin + alpa, 
      sakit, 
      izin, 
      alpa,
      isPerfect: (sakit + izin + alpa) === 0 && classStudents.length > 0
    };
  }, [students, attendance, selectedClass]);

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Harian');

    // Add Title
    worksheet.addRow(['REKAP KEHADIRAN HARIAN SISWA']);
    worksheet.addRow([schoolInfo?.nama_sekolah || 'Nama Sekolah']);
    worksheet.addRow([`Kelas: ${selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass}   |   Tanggal: ${formatDate(selectedDate)}`]);
    worksheet.addRow([]); // empty row

    // Merge cells for title
    worksheet.mergeCells('A1:H1');
    worksheet.mergeCells('A2:H2');
    worksheet.mergeCells('A3:H3');

    // Style titles
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    const headers = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'L/P', 'Status', 'Wali Kelas', 'Keterangan'];
    const headerRow = worksheet.addRow(headers);
    
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    filteredData.forEach((item, i) => {
      const status = item.record?.status || 'Hadir';
      const row = worksheet.addRow([
        i + 1,
        item.nis,
        item.nama,
        item.kelas,
        item.gender,
        status,
        waliMap[item.kelas?.trim()] || '-',
        item.record?.note || '-'
      ]);
      row.eachCell((cell, colNumber) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (colNumber === 3 || colNumber === 7 || colNumber === 8) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        
        // Color status
        if (colNumber === 6) {
          if (status === 'Sakit' || status === 'Izin') {
            cell.font = { color: { argb: 'FFD97706' }, bold: true }; // Amber
          } else if (status === 'Alpa') {
            cell.font = { color: { argb: 'FFDC2626' }, bold: true }; // Rose
          }
        }
      });
    });

    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 15;
    worksheet.getColumn(5).width = 10;
    worksheet.getColumn(6).width = 15;
    worksheet.getColumn(7).width = 28;
    worksheet.getColumn(8).width = 30;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Rekap_Harian_${selectedDate}_${selectedClass}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP KEHADIRAN HARIAN SISWA', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(schoolInfo?.nama_sekolah || 'Nama Sekolah', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Kelas: ${selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass}   |   Tanggal: ${formatDate(selectedDate)}`, doc.internal.pageSize.getWidth() / 2, 29, { align: 'center' });

    const headers = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'L/P', 'Status', 'Wali Kelas', 'Keterangan'];
    const rows = filteredData.map((item, i) => [
      i + 1,
      item.nis,
      item.nama,
      item.kelas,
      item.gender,
      item.record?.status || 'Hadir',
      waliMap[item.kelas?.trim()] || '-',
      item.record?.note || '-'
    ]);

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
      columnStyles: {
        2: { halign: 'left' },
        6: { halign: 'left' },
        7: { halign: 'left' },
      },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 5) {
          const val = data.cell.raw;
          if (val === 'Sakit' || val === 'Izin') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Alpa') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    doc.save(`Rekap_Harian_${selectedDate}_${selectedClass}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* TOOLBAR (No Print) */}
      <div className="p-4 sm:p-6 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center gap-4 justify-between no-print">
        <div className="flex flex-wrap gap-3">
          <input 
            type="date" 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
          <select 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
          >
            <option value="ALL">Semua Kelas</option>
            {classes.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value as FilterStatus)}
          >
            <option value="ALL">S + I + A (Semua)</option>
            <option value="Sakit">Sakit Saja</option>
            <option value="Izin">Izin Saja</option>
            <option value="Alpa">Alpa Saja</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportExcel}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button 
            onClick={handleExportPDF}
            className="px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 border border-transparent rounded-md shadow-sm flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
          <button 
            onClick={handlePrint}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* PRINT HEADER */}
      <div className="hidden print-only mb-6 text-center text-black">
        <h2 className="text-xl font-bold uppercase mb-1">Rekap Kehadiran Harian Siswa</h2>
        <p className="text-md">
          Kelas: {selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass} | Tanggal: {formatDate(selectedDate)}
        </p>
      </div>

      {/* SUMMARY CARDS */}
      <div className="p-4 sm:p-6 bg-slate-50/50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 no-print">
        <StatCard label="Total Tidak Hadir" value={stats.total} color="text-slate-900" />
        <StatCard label="Sakit" value={stats.sakit} color="text-amber-600" />
        <StatCard label="Izin" value={stats.izin} color="text-sky-600" />
        <StatCard label="Alpa" value={stats.alpa} color="text-rose-600" />
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto max-h-[calc(100vh-340px)] min-h-[320px] print:max-h-none print:overflow-visible print:min-h-0">
        {isLoading ? (
          <div className="p-4 sm:p-6 space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded"></div>)}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="py-20 p-4 sm:p-6 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900">
              {selectedStatus === 'ALL' ? 'Semua Hadir!' : `Tidak ada siswa ${selectedStatus}`}
            </h3>
            <p className="text-slate-500 mt-2">
              {selectedStatus === 'ALL'
                ? 'Tidak ada siswa yang absen pada tanggal ini di kelas terpilih.'
                : `Tidak ada siswa dengan status ${selectedStatus} pada filter yang dipilih.`}
            </p>
          </div>
        ) : (
          <div className="relative">
            <table className="w-full text-sm text-left print-table">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200 print:static print:shadow-none">
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 font-medium w-12 text-center bg-slate-50">No</th>
                  <th className="px-4 py-3 font-medium w-32 bg-slate-50">NIS</th>
                  <th className="px-4 py-3 font-medium bg-slate-50">Nama Siswa</th>
                  <th className="px-4 py-3 font-medium w-24 bg-slate-50">Kelas</th>
                  <th className="px-4 py-3 font-medium w-16 text-center bg-slate-50">L/P</th>
                  <th className="px-4 py-3 font-medium w-28 bg-slate-50">Status</th>
                  <th className="px-4 py-3 font-medium w-48 bg-slate-50">Wali Kelas</th>
                  <th className="px-4 py-3 font-medium bg-slate-50">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredData.map((s, idx) => {
                  const status = s.record?.status || 'Hadir';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-center">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono">{s.nis}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.nama}</td>
                      <td className="px-4 py-3">{s.kelas}</td>
                      <td className="px-4 py-3 text-center">{s.gender}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-semibold print:border print:bg-transparent",
                          status === 'Hadir' ? "bg-emerald-100 text-emerald-700 print:text-emerald-800" :
                          status === 'Sakit' ? "bg-amber-100 text-amber-700 print:text-amber-800" :
                          status === 'Izin' ? "bg-sky-100 text-sky-700 print:text-sky-800" :
                          "bg-rose-100 text-rose-700 print:text-rose-800"
                        )}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{waliMap[s.kelas?.trim()] || '-'}</td>
                      <td className="px-4 py-3">{s.record?.note || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={cn("text-2xl font-display font-bold mt-1", color)}>{value}</span>
    </div>
  );
}
