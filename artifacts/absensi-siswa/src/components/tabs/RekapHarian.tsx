import { useState, useMemo } from 'react';
import { Download, Printer, CheckCircle, FileText, UserX, HeartPulse, Clock, AlertTriangle } from 'lucide-react';
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
    <div className="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      {/* TOOLBAR (No Print) */}
      <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center gap-4 justify-between no-print">
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

      {/* PRINT HEADER / KOP RESMI */}
      <div className="hidden print-only mb-4 text-black">
        <div className="text-center pb-2 border-b-2 border-black">
          <h1 className="text-lg font-bold uppercase tracking-wider text-black">
            {schoolInfo?.nama_sekolah || 'SMK ASSALAAM BANDUNG'}
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {schoolInfo?.kota ? `Jl. Situtarate - Terusan Cibaduyut, ${schoolInfo.kota}` : 'Jl. Situtarate - Terusan Cibaduyut, Kab. Bandung'}
          </p>
        </div>
        <div className="text-center mt-3 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-black">
            REKAP KEHADIRAN HARIAN SISWA
          </h2>
          <div className="flex justify-between items-center text-xs mt-2 text-slate-800 border-b border-slate-300 pb-2">
            <span>Kelas: <strong>{selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass}</strong></span>
            <span>Tanggal: <strong>{formatDate(selectedDate)}</strong></span>
            <span>Filter: <strong>{selectedStatus === 'ALL' ? 'Semua Tidak Hadir (S/I/A)' : selectedStatus}</strong></span>
          </div>
        </div>
        
        {/* Ringkasan Jumlah */}
        <div className="flex gap-4 text-xs font-medium py-1 px-2.5 bg-slate-100 border border-slate-300 rounded mb-2">
          <span>Total Tidak Hadir: <strong>{stats.total} siswa</strong></span>
          <span>• Sakit: <strong>{stats.sakit}</strong></span>
          <span>• Izin: <strong>{stats.izin}</strong></span>
          <span>• Alpa: <strong>{stats.alpa}</strong></span>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-50/50 border-b border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 no-print">
        <StatCard 
          label="Total Tidak Hadir" 
          value={stats.total} 
          icon={<UserX className="w-4 h-4 text-indigo-600" />}
          bg="bg-gradient-to-br from-indigo-50/90 via-slate-50 to-indigo-100/40 border-indigo-200/70"
          valueColor="text-indigo-950"
          labelColor="text-indigo-800/80"
          iconBg="bg-indigo-100/80"
        />
        <StatCard 
          label="Sakit" 
          value={stats.sakit} 
          icon={<HeartPulse className="w-4 h-4 text-amber-600" />}
          bg="bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-amber-100/40 border-amber-200/80"
          valueColor="text-amber-950"
          labelColor="text-amber-800/80"
          iconBg="bg-amber-100/80"
        />
        <StatCard 
          label="Izin" 
          value={stats.izin} 
          icon={<Clock className="w-4 h-4 text-sky-600" />}
          bg="bg-gradient-to-br from-sky-50/90 via-blue-50/40 to-sky-100/40 border-sky-200/80"
          valueColor="text-sky-950"
          labelColor="text-sky-800/80"
          iconBg="bg-sky-100/80"
        />
        <StatCard 
          label="Alpa" 
          value={stats.alpa} 
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
          bg="bg-gradient-to-br from-rose-50/90 via-red-50/40 to-rose-100/40 border-rose-200/80"
          valueColor="text-rose-950"
          labelColor="text-rose-800/80"
          iconBg="bg-rose-100/80"
        />
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto min-h-0 print:overflow-visible relative">
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
          <table className="w-full text-sm text-left print-table-harian border-separate border-spacing-0">
            <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0 z-10 shadow-xs border-b border-slate-200 print:static print:shadow-none">
              <tr>
                <th className="px-4 py-3 font-semibold w-12 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">No</th>
                <th className="px-4 py-3 font-semibold w-32 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">NIS</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Nama Siswa</th>
                <th className="px-4 py-3 font-semibold w-24 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Kelas</th>
                <th className="px-4 py-3 font-semibold w-16 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">L/P</th>
                <th className="px-4 py-3 font-semibold w-28 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Status</th>
                <th className="px-4 py-3 font-semibold w-48 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Wali Kelas</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Keterangan</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredData.map((s, idx) => {
                  const status = s.record?.status || 'Hadir';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-center">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">{s.nis}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.nama}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.kelas}</td>
                      <td className="px-4 py-3 text-center">{s.gender}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-semibold print:border print:bg-transparent print:px-2 print:py-0.5 print:text-[8pt] print:border-slate-400 print:text-black",
                          status === 'Hadir' ? "bg-emerald-100 text-emerald-700" :
                          status === 'Sakit' ? "bg-amber-100 text-amber-700" :
                          status === 'Izin' ? "bg-sky-100 text-sky-700" :
                          "bg-rose-100 text-rose-700"
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
        )}

        {/* PRINT SIGNATURE BLOCK */}
        <div className="hidden print-only mt-8 print-break-inside-avoid text-xs text-black">
          <div className="flex justify-between items-start pt-4 px-2">
            <div className="text-center w-56">
              <p>Mengetahui,</p>
              <p className="font-semibold">Kepala Sekolah</p>
              <div className="h-16"></div>
              <p className="font-bold underline">{schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.'}</p>
              <p className="text-[10px] mt-0.5">NIP. {schoolInfo?.nip_kepala || '..........................'}</p>
            </div>

            <div className="text-center w-56">
              <p>{schoolInfo?.kota || 'Kab. Bandung'}, {formatShortDate(selectedDate)}</p>
              <p className="font-semibold">
                {selectedClass !== 'ALL' && waliMap[selectedClass.trim()] ? `Wali Kelas ${selectedClass}` : 'Petugas Piket Absensi'}
              </p>
              <div className="h-16"></div>
              <p className="font-bold underline">
                {selectedClass !== 'ALL' && waliMap[selectedClass.trim()] ? waliMap[selectedClass.trim()] : '.........................................'}
              </p>
              <p className="text-[10px] mt-0.5">NIP. ..........................</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon,
  bg,
  valueColor,
  labelColor,
  iconBg
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
  bg: string;
  valueColor: string;
  labelColor: string;
  iconBg: string;
}) {
  return (
    <div className={cn("border rounded-xl px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5", bg)}>
      <div className="flex flex-col min-w-0">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider truncate", labelColor)}>{label}</span>
        <span className={cn("text-xl sm:text-2xl font-display font-bold leading-tight mt-0.5", valueColor)}>{value}</span>
      </div>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ml-2", iconBg)}>
        {icon}
      </div>
    </div>
  );
}
