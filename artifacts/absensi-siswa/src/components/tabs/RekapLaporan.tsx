import React, { useState, useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { useClasses, useStudents, useAttendanceRange, useSchoolInfo, useWaliKelas } from '@/lib/queries';
import { cn, getMonthDates, formatShortDate } from '@/lib/utils';
import type { AttendanceStatus } from '@/types/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export default function RekapLaporan() {
  const [reportMode, setReportMode] = useState<'bulan' | 'rentang'>('bulan');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  const [startDateInput, setStartDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDateInput, setEndDateInput] = useState<string>(new Date().toISOString().split('T')[0]);

  const { data: classes = [] } = useClasses();
  const { data: students = [] } = useStudents();
  const { data: schoolInfo } = useSchoolInfo();
  const { data: waliKelas = [] } = useWaliKelas();

  // Determine actual selected class or default to first
  const activeClass = selectedClass || (classes.length > 0 ? classes[0].name : '');
  const activeWali = waliKelas.find(w => w.kelas === activeClass);

  const datesInMonth = useMemo(() => getMonthDates(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  const startDate = reportMode === 'bulan' ? datesInMonth[0] : startDateInput;
  const endDate = reportMode === 'bulan' ? datesInMonth[datesInMonth.length - 1] : endDateInput;

  const monthsInRange = useMemo(() => {
    if (reportMode === 'bulan') return [{ year: selectedYear, month: selectedMonth, label: `${MONTHS[selectedMonth]} ${selectedYear}` }];
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      months.push({ year: current.getFullYear(), month: current.getMonth(), label: `${MONTHS[current.getMonth()]} ${current.getFullYear()}` });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    return months;
  }, [reportMode, selectedMonth, selectedYear, startDate, endDate]);

  const classStudents = useMemo(() => students.filter(s => s.kelas === activeClass), [students, activeClass]);
  const studentIds = useMemo(() => classStudents.map(s => s.id), [classStudents]);

  const { data: attendance = [], isLoading } = useAttendanceRange(startDate, endDate, studentIds);

  const reportData = useMemo(() => {
    if (!activeClass) return [];

    
    // Quick lookup map: student_id -> date -> status
    const attMap = new Map<string, Map<string, AttendanceStatus>>();
    
    // Also track which dates have ANY attendance for this class
    const activeDates = new Set<string>();
    const studentIdSet = new Set(studentIds);

    attendance.forEach(r => {
      // Check if student is in this class
      if (studentIdSet.has(r.student_id)) {
        if (!attMap.has(r.student_id)) {
          attMap.set(r.student_id, new Map());
        }
        attMap.get(r.student_id)!.set(r.date, r.status);
        activeDates.add(r.date);
      }
    });

    return classStudents.map(s => {
      const studentRecords = attMap.get(s.id) || new Map();
      let h = 0, sakit = 0, i = 0, a = 0;
      
      const dailyStatus = datesInMonth.map(date => {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const hasClassRecord = activeDates.has(date);
        const record = studentRecords.get(date);

        let finalStatus = '-';
        if (record) {
          finalStatus = record === 'TTS' ? 'T' : record.charAt(0); // H, S, I, A, T
        } else if (hasClassRecord && !isWeekend) {
          // If class had attendance taken, but this student has no record -> assume Hadir
          finalStatus = 'H';
        }

        if (finalStatus === 'H' || finalStatus === 'T') h++;
        else if (finalStatus === 'S') sakit++;
        else if (finalStatus === 'I') i++;
        else if (finalStatus === 'A') a++;

        return finalStatus;
      });

      const totalActiveDays = activeDates.size;
      const percentHadir = totalActiveDays > 0 ? Math.round((h / totalActiveDays) * 100) : 0;

      return {
        ...s,
        dailyStatus,
        summary: { h, s: sakit, i, a, percentHadir }
      };
    });
  }, [activeClass, classStudents, attendance, datesInMonth, reportMode]);

  const reportDataRentang = useMemo(() => {
    if (reportMode !== 'rentang' || !activeClass) return [];

    const attMap = new Map<string, Map<string, { status: AttendanceStatus; note: string }>>();
    const activeDates = new Set<string>();

    attendance.forEach(r => {
      if (classStudents.some(s => s.id === r.student_id)) {
        if (!attMap.has(r.student_id)) {
          attMap.set(r.student_id, new Map());
        }
        attMap.get(r.student_id)!.set(r.date, { status: r.status, note: r.note || '' });
        activeDates.add(r.date);
      }
    });

    return classStudents.map(s => {
      const studentRecords = attMap.get(s.id) || new Map();
      let totalH = 0, totalS = 0, totalI = 0, totalA = 0;
      
      const monthlySummary = monthsInRange.map(mInfo => {
        let h = 0, sakit = 0, i = 0, a = 0;
        const prefix = `${mInfo.year}-${String(mInfo.month + 1).padStart(2, '0')}`;
        const activeDatesInMonth = Array.from(activeDates).filter(d => d.startsWith(prefix));
        
        activeDatesInMonth.forEach(date => {
          const d = new Date(date);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const record = studentRecords.get(date);
          let finalStatus = '-';
          if (record) {
            finalStatus = record.status.charAt(0);
          } else if (!isWeekend) {
            finalStatus = 'H';
          }

          if (finalStatus === 'H') h++;
          else if (finalStatus === 'S') sakit++;
          else if (finalStatus === 'I') i++;
          else if (finalStatus === 'A') a++;
        });

        // Collect absent notes (Sakit, Izin, Alpa) for this student in this month
        const absentDates = Array.from(studentRecords.keys())
          .filter(date => date.startsWith(prefix))
          .sort();

        const notes: { date: string; dateFormatted: string; status: AttendanceStatus; note: string; displayText: string }[] = [];
        absentDates.forEach(date => {
          const rec = studentRecords.get(date);
          if (rec && rec.status !== 'Hadir') {
            const [y, m, d] = date.split('-');
            const dateFormatted = `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
            const noteText = rec.note ? rec.note.trim() : '';
            const idxNum = notes.length + 1;
            const displayText = `${idxNum}. Tanggal ${dateFormatted} (${rec.status})${noteText ? `: ${noteText}` : ''}`;
            notes.push({
              date,
              dateFormatted,
              status: rec.status,
              note: noteText,
              displayText
            });
          }
        });

        const notesText = notes.map(n => n.displayText).join('\n');

        totalH += h;
        totalS += sakit;
        totalI += i;
        totalA += a;

        const totalActive = activeDatesInMonth.length;
        const percent = totalActive > 0 ? Math.round((h / totalActive) * 100) : 0;
        return { label: mInfo.label, h, s: sakit, i, a, percent, notes, notesText };
      });

      const grandTotalActive = totalH + totalS + totalI + totalA;
      const totalPercent = grandTotalActive > 0 ? Math.round((totalH / grandTotalActive) * 100) : 0;

      return {
        ...s,
        monthlySummary,
        summary: { h: totalH, s: totalS, i: totalI, a: totalA, percentHadir: totalPercent }
      };
    });
  }, [activeClass, classStudents, attendance, monthsInRange, reportMode]);

  const today = new Date();
  const printDateStr = `${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Absensi');

    // Add Title
    worksheet.addRow(['BUKU KEHADIRAN SISWA']);
    worksheet.addRow([schoolInfo?.nama_sekolah || 'Nama Sekolah']);
    worksheet.addRow([`Kelas: ${activeClass}   |   Bulan: ${MONTHS[selectedMonth]} ${selectedYear}   |   Wali Kelas: ${activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.'}`]);
    worksheet.addRow([]); // empty row

    // Merge cells for title (A to the last column)
    const lastColIndex = 3 + datesInMonth.length + 5;
    const lastColLetter = worksheet.getColumn(lastColIndex).letter;
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    worksheet.mergeCells(`A2:${lastColLetter}2`);
    worksheet.mergeCells(`A3:${lastColLetter}3`);

    // Style titles
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    const headers = [
      'No', 'NIS', 'Nama Siswa', 
      ...datesInMonth.map(d => parseInt(d.split('-')[2], 10).toString()), // Just the day number
      'H', 'S', 'I', 'A', '% Hadir'
    ];
    
    const headerRow = worksheet.addRow(headers);

    // Style headers
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Add data rows
    reportData.forEach((item, idx) => {
      const rowData = [
        idx + 1,
        item.nis,
        item.nama,
        ...item.dailyStatus,
        item.summary.h > 0 ? item.summary.h : '',
        item.summary.s > 0 ? item.summary.s : '',
        item.summary.i > 0 ? item.summary.i : '',
        item.summary.a > 0 ? item.summary.a : '',
        `${item.summary.percentHadir}%`
      ];
      
      const row = worksheet.addRow(rowData);
      
      // Style cells
      row.eachCell((cell, colNumber) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        
        if (colNumber === 2 || colNumber === 3) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Apply colors to daily status columns
        if (colNumber > 3 && colNumber <= 3 + datesInMonth.length) {
          const val = cell.value as string;
          if (val === 'H') {
            cell.font = { color: { argb: 'FF16A34A' }, bold: true }; // Emerald 600
          } else if (val === 'S' || val === 'I') {
            cell.font = { color: { argb: 'FFD97706' }, bold: true }; // Amber 600
          } else if (val === 'A') {
            cell.font = { color: { argb: 'FFDC2626' }, bold: true }; // Rose 600
          }
        }
      });
    });

    // Set column widths
    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 25;
    for (let i = 4; i <= 3 + datesInMonth.length; i++) {
      worksheet.getColumn(i).width = 5;
    }

    // Add Signature Section
    worksheet.addRow([]);
    worksheet.addRow([]);
    
    const dateRowIndex = worksheet.rowCount + 1;
    const rightColIndex = datesInMonth.length + 3; // Align with the end of dates
    const centerColIndex = Math.floor(datesInMonth.length / 2) + 3; // Align to the middle

    worksheet.getCell(dateRowIndex, rightColIndex).value = `${schoolInfo?.kota || 'Kab. Bandung'}, ${printDateStr}`;
    worksheet.getCell(dateRowIndex, rightColIndex).alignment = { horizontal: 'center' };
    
    const titleRowIndex = worksheet.rowCount + 2;
    worksheet.getCell(titleRowIndex, 3).value = 'Kepala Sekolah';
    worksheet.getCell(titleRowIndex, 3).alignment = { horizontal: 'center' };
    worksheet.getCell(titleRowIndex, centerColIndex).value = 'Wakasek Kesiswaan';
    worksheet.getCell(titleRowIndex, centerColIndex).alignment = { horizontal: 'center' };
    worksheet.getCell(titleRowIndex, rightColIndex).value = `Wali Kelas ${activeClass}`;
    worksheet.getCell(titleRowIndex, rightColIndex).alignment = { horizontal: 'center' };

    const nameRowIndex = titleRowIndex + 4; // space for signature
    worksheet.getCell(nameRowIndex, 3).value = schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.';
    worksheet.getCell(nameRowIndex, 3).font = { bold: true };
    worksheet.getCell(nameRowIndex, 3).alignment = { horizontal: 'center' };
    
    worksheet.getCell(nameRowIndex, centerColIndex).value = schoolInfo?.wakil_kesiswaan || 'Asep Lukman, S.Pd.,Gr';
    worksheet.getCell(nameRowIndex, centerColIndex).font = { bold: true };
    worksheet.getCell(nameRowIndex, centerColIndex).alignment = { horizontal: 'center' };

    worksheet.getCell(nameRowIndex, rightColIndex).value = activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.';
    worksheet.getCell(nameRowIndex, rightColIndex).font = { bold: true };
    worksheet.getCell(nameRowIndex, rightColIndex).alignment = { horizontal: 'center' };

    const nipRowIndex = nameRowIndex + 1;
    worksheet.getCell(nipRowIndex, 3).value = `NIP. ${schoolInfo?.nip_kepala || '..........................'}`;
    worksheet.getCell(nipRowIndex, 3).alignment = { horizontal: 'center' };
    worksheet.getCell(nipRowIndex, centerColIndex).value = `NIP. ${schoolInfo?.nip_wakil || '..........................'}`;
    worksheet.getCell(nipRowIndex, centerColIndex).alignment = { horizontal: 'center' };
    worksheet.getCell(nipRowIndex, rightColIndex).value = `NIP. ${activeWali?.nip || '..........................'}`;
    worksheet.getCell(nipRowIndex, rightColIndex).alignment = { horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Rekap_Bulanan_${activeClass}_${MONTHS[selectedMonth]}_${selectedYear}.xlsx`);
  };

  const handleExportPDF = () => {
    // F4 / Folio size is approximately 215.9 mm x 330.2 mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [330.2, 215.9]
    });
    
    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BUKU KEHADIRAN SISWA', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(schoolInfo?.nama_sekolah || 'Nama Sekolah', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const infoText = `Kelas: ${activeClass}   |   Bulan: ${MONTHS[selectedMonth]} ${selectedYear}   |   Wali Kelas: ${activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.'}`;
    doc.text(infoText, doc.internal.pageSize.getWidth() / 2, 29, { align: 'center' });

    const headers = [
      'No', 'NIS', 'Nama Siswa', 
      ...datesInMonth.map(d => parseInt(d.split('-')[2], 10).toString()),
      'H', 'S', 'I', 'A', '%'
    ];

    const rows = reportData.map((item, idx) => [
      idx + 1,
      item.nis,
      item.nama,
      ...item.dailyStatus,
      item.summary.h > 0 ? item.summary.h : '',
      item.summary.s > 0 ? item.summary.s : '',
      item.summary.i > 0 ? item.summary.i : '',
      item.summary.a > 0 ? item.summary.a : '',
      `${item.summary.percentHadir}%`
    ]);

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
      columnStyles: {
        2: { halign: 'left', cellWidth: 40 },
      },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], lineColor: [203, 213, 225], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { bottom: 20 },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index >= 3 && data.column.index < 3 + datesInMonth.length) {
          const val = data.cell.raw;
          if (val === 'H') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'S' || val === 'I') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'A') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Check if there is enough space for the signatures (needs about 45mm)
    if (finalY + 45 > pageHeight) {
      doc.addPage();
      finalY = 20; // reset Y to top of new page
    }
    
    doc.setFontSize(10);
    doc.text(`${schoolInfo?.kota || 'Kab. Bandung'}, ${printDateStr}`, pageWidth - 20, finalY, { align: 'right' });
    
    const col1 = pageWidth * 0.15;
    const col2 = pageWidth * 0.5;
    const col3 = pageWidth * 0.85;

    doc.text('Kepala Sekolah', col1, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.', col1, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${schoolInfo?.nip_kepala || '..........................'}`, col1, finalY + 35, { align: 'center' });

    doc.text('Wakasek Kesiswaan', col2, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolInfo?.wakil_kesiswaan || 'Asep Lukman, S.Pd.,Gr', col2, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${schoolInfo?.nip_wakil || '..........................'}`, col2, finalY + 35, { align: 'center' });

    doc.text(`Wali Kelas ${activeClass}`, col3, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.', col3, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${activeWali?.nip || '..........................'}`, col3, finalY + 35, { align: 'center' });

    doc.save(`Rekap_Bulanan_${activeClass}_${MONTHS[selectedMonth]}_${selectedYear}.pdf`);
  };

  const handleExportExcelRentang = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Rentang');

    worksheet.addRow(['BUKU KEHADIRAN SISWA (RENTANG WAKTU)']);
    worksheet.addRow([schoolInfo?.nama_sekolah || 'Nama Sekolah']);
    worksheet.addRow([`Kelas: ${activeClass}   |   Periode: ${formatShortDate(startDate)} s/d ${formatShortDate(endDate)}   |   Wali Kelas: ${activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.'}`]);
    worksheet.addRow([]);

    worksheet.mergeCells('A1:J1');
    worksheet.mergeCells('A2:J2');
    worksheet.mergeCells('A3:J3');
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    const headers = ['NO', 'NIS', 'NAMA SISWA', 'BULAN', 'H', 'S', 'I', 'A', '%', 'KETERANGAN'];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    let currentRow = 6;
    reportDataRentang.forEach((item, idx) => {
      const startRow = currentRow;
      
      item.monthlySummary.forEach(m => {
        const row = worksheet.addRow([
          idx + 1, item.nis, item.nama, m.label,
          m.h > 0 ? m.h : '-', m.s > 0 ? m.s : '-', m.i > 0 ? m.i : '-', m.a > 0 ? m.a : '-', `${m.percent}%`,
          m.notesText || '-'
        ]);
        row.eachCell((cell, colNumber) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (colNumber === 2 || colNumber === 3 || colNumber === 4 || colNumber === 10) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: colNumber === 10 };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });
        currentRow++;
      });

      const totalRow = worksheet.addRow([
        '', '', 'TOTAL', '',
        item.summary.h > 0 ? item.summary.h : '-', item.summary.s > 0 ? item.summary.s : '-', item.summary.i > 0 ? item.summary.i : '-', item.summary.a > 0 ? item.summary.a : '-', `${item.summary.percentHadir}%`,
        '-'
      ]);
      totalRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (colNumber === 3) cell.alignment = { horizontal: 'right', vertical: 'middle' };
        else cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      currentRow++;

      if (item.monthlySummary.length > 0) {
        worksheet.mergeCells(`A${startRow}:A${currentRow - 2}`);
        worksheet.mergeCells(`B${startRow}:B${currentRow - 2}`);
        worksheet.mergeCells(`C${startRow}:C${currentRow - 2}`);
        worksheet.mergeCells(`A${currentRow - 1}:B${currentRow - 1}`); 
        worksheet.mergeCells(`C${currentRow - 1}:D${currentRow - 1}`); 
      }
    });

    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 20;
    for (let i = 5; i <= 9; i++) worksheet.getColumn(i).width = 8;
    worksheet.getColumn(10).width = 45;

    worksheet.addRow([]);
    worksheet.addRow([]);
    
    const dateRowIndex = worksheet.rowCount + 1;
    worksheet.getCell(dateRowIndex, 10).value = `${schoolInfo?.kota || 'Kab. Bandung'}, ${printDateStr}`;
    worksheet.getCell(dateRowIndex, 10).alignment = { horizontal: 'center' };
    
    const titleRowIndex = worksheet.rowCount + 2;
    worksheet.getCell(titleRowIndex, 3).value = 'Kepala Sekolah';
    worksheet.getCell(titleRowIndex, 3).alignment = { horizontal: 'center' };
    worksheet.getCell(titleRowIndex, 6).value = 'Wakasek Kesiswaan';
    worksheet.getCell(titleRowIndex, 6).alignment = { horizontal: 'center' };
    worksheet.getCell(titleRowIndex, 10).value = `Wali Kelas ${activeClass}`;
    worksheet.getCell(titleRowIndex, 10).alignment = { horizontal: 'center' };

    const nameRowIndex = titleRowIndex + 4;
    worksheet.getCell(nameRowIndex, 3).value = schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.';
    worksheet.getCell(nameRowIndex, 3).font = { bold: true };
    worksheet.getCell(nameRowIndex, 3).alignment = { horizontal: 'center' };
    
    worksheet.getCell(nameRowIndex, 6).value = schoolInfo?.wakil_kesiswaan || 'Asep Lukman, S.Pd.,Gr';
    worksheet.getCell(nameRowIndex, 6).font = { bold: true };
    worksheet.getCell(nameRowIndex, 6).alignment = { horizontal: 'center' };

    worksheet.getCell(nameRowIndex, 10).value = activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.';
    worksheet.getCell(nameRowIndex, 10).font = { bold: true };
    worksheet.getCell(nameRowIndex, 10).alignment = { horizontal: 'center' };

    const nipRowIndex = nameRowIndex + 1;
    worksheet.getCell(nipRowIndex, 3).value = `NIP. ${schoolInfo?.nip_kepala || '..........................'}`;
    worksheet.getCell(nipRowIndex, 3).alignment = { horizontal: 'center' };
    worksheet.getCell(nipRowIndex, 6).value = `NIP. ${schoolInfo?.nip_wakil || '..........................'}`;
    worksheet.getCell(nipRowIndex, 6).alignment = { horizontal: 'center' };
    worksheet.getCell(nipRowIndex, 10).value = `NIP. ${activeWali?.nip || '..........................'}`;
    worksheet.getCell(nipRowIndex, 10).alignment = { horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Rekap_Rentang_${activeClass}.xlsx`);
  };

  const handleExportPDFRentang = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BUKU KEHADIRAN SISWA (RENTANG WAKTU)', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(schoolInfo?.nama_sekolah || 'Nama Sekolah', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const infoText = `Kelas: ${activeClass}   |   Periode: ${formatShortDate(startDate)} s/d ${formatShortDate(endDate)}   |   Wali Kelas: ${activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.'}`;
    doc.text(infoText, doc.internal.pageSize.getWidth() / 2, 29, { align: 'center' });

    const headers = ['NO', 'NIS', 'NAMA SISWA', 'BULAN', 'H', 'S', 'I', 'A', '%', 'KETERANGAN'];
    const rows: any[] = [];

    reportDataRentang.forEach((item, idx) => {
      item.monthlySummary.forEach((m, mIdx) => {
        rows.push([
          mIdx === 0 ? idx + 1 : '',
          mIdx === 0 ? item.nis : '',
          mIdx === 0 ? item.nama : '',
          m.label,
          m.h > 0 ? m.h : '-', m.s > 0 ? m.s : '-', m.i > 0 ? m.i : '-', m.a > 0 ? m.a : '-', `${m.percent}%`,
          m.notesText || '-'
        ]);
      });
      rows.push([
        { content: '', colSpan: 2 },
        { content: 'TOTAL', styles: { halign: 'right', fontStyle: 'bold' } },
        '',
        { content: item.summary.h > 0 ? item.summary.h : '-', styles: { fontStyle: 'bold' } },
        { content: item.summary.s > 0 ? item.summary.s : '-', styles: { fontStyle: 'bold' } },
        { content: item.summary.i > 0 ? item.summary.i : '-', styles: { fontStyle: 'bold' } },
        { content: item.summary.a > 0 ? item.summary.a : '-', styles: { fontStyle: 'bold' } },
        { content: `${item.summary.percentHadir}%`, styles: { fontStyle: 'bold' } },
        { content: '-', styles: { fontStyle: 'normal' } }
      ]);
    });

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
      columnStyles: { 
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 32, halign: 'left' }, 
        3: { cellWidth: 22, halign: 'left' },
        4: { cellWidth: 7, halign: 'center' },
        5: { cellWidth: 7, halign: 'center' },
        6: { cellWidth: 7, halign: 'center' },
        7: { cellWidth: 7, halign: 'center' },
        8: { cellWidth: 11, halign: 'center' },
        9: { halign: 'left' }
      },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], lineColor: [203, 213, 225], lineWidth: 0.1 },
      margin: { bottom: 20 },
      didParseCell: function(data) {
        const rawRow = data.row.raw as any;
        if (rawRow?.[1]?.content === 'TOTAL' || rawRow?.[1] === 'TOTAL') {
          data.cell.styles.fillColor = [248, 250, 252];
        }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    if (finalY + 45 > pageHeight) { doc.addPage(); finalY = 20; }
    
    doc.setFontSize(10);
    doc.text(`${schoolInfo?.kota || 'Kab. Bandung'}, ${printDateStr}`, pageWidth - 20, finalY, { align: 'right' });
    
    const col1 = pageWidth * 0.2;
    const col2 = pageWidth * 0.5;
    const col3 = pageWidth * 0.8;
    
    doc.text('Kepala Sekolah', col1, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.', col1, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${schoolInfo?.nip_kepala || '..........................'}`, col1, finalY + 35, { align: 'center' });

    doc.text('Wakasek Kesiswaan', col2, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolInfo?.wakil_kesiswaan || 'Asep Lukman, S.Pd.,Gr', col2, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${schoolInfo?.nip_wakil || '..........................'}`, col2, finalY + 35, { align: 'center' });

    doc.text(`Wali Kelas ${activeClass}`, col3, finalY + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.', col3, finalY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${activeWali?.nip || '..........................'}`, col3, finalY + 35, { align: 'center' });

    doc.save(`Rekap_Rentang_${activeClass}.pdf`);
  };

  return (
    <div className="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      {/* TOOLBAR */}
      <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center gap-4 justify-between no-print">
        <div className="flex flex-wrap gap-3">
          <select 
            className="py-2 px-3 bg-slate-100 font-medium border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 text-primary"
            value={reportMode}
            onChange={e => setReportMode(e.target.value as 'bulan' | 'rentang')}
          >
            <option value="bulan">Laporan Bulanan</option>
            <option value="rentang">Rentang Waktu (Semester)</option>
          </select>

          <div className="w-px h-8 bg-slate-200 mx-1 self-center hidden sm:block"></div>

          <select 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
            value={activeClass}
            onChange={e => setSelectedClass(e.target.value)}
          >
            {classes.length === 0 && <option value="">Belum ada kelas</option>}
            {classes.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {reportMode === 'bulan' ? (
            <>
              <select 
                className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select 
                className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 shadow-sm">
              <input 
                type="date" 
                className="py-1.5 px-2 bg-transparent text-sm outline-none"
                value={startDateInput}
                onChange={e => setStartDateInput(e.target.value)}
              />
              <span className="text-slate-400 text-sm font-medium">s/d</span>
              <input 
                type="date" 
                className="py-1.5 px-2 bg-transparent text-sm outline-none"
                value={endDateInput}
                onChange={e => setEndDateInput(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={reportMode === 'bulan' ? handleExportExcel : handleExportExcelRentang}
            disabled={reportMode === 'bulan' ? reportData.length === 0 : reportDataRentang.length === 0}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button 
            onClick={reportMode === 'bulan' ? handleExportPDF : handleExportPDFRentang}
            disabled={reportMode === 'bulan' ? reportData.length === 0 : reportDataRentang.length === 0}
            className="px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 border border-transparent rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        </div>
      </div>

      {/* PRINT HEADER */}
      <div className="print-only mb-4 text-center text-black border-b-2 border-black pb-3">
        <h2 className="text-base font-bold uppercase tracking-wide mb-0.5">
          {reportMode === 'bulan' ? 'Buku Kehadiran Siswa' : 'Buku Kehadiran Siswa (Rentang Waktu)'}
        </h2>
        <h3 className="text-sm font-semibold">{schoolInfo?.nama_sekolah || 'Nama Sekolah'}</h3>
        <p className="text-xs mt-1">
          Kelas: <strong>{activeClass}</strong> &nbsp;|&nbsp;
          {reportMode === 'bulan' ? (
            <>Bulan: <strong>{MONTHS[selectedMonth]} {selectedYear}</strong></>
          ) : (
            <>Periode: <strong>{formatShortDate(startDate)} s/d {formatShortDate(endDate)}</strong></>
          )}
          &nbsp;|&nbsp;
          Wali Kelas: <strong>{activeWali?.nama || '.....................'}</strong>
        </p>
      </div>

      {/* MATRIX TABLE */}
      <div className="flex-1 overflow-auto min-h-0 p-4 sm:p-6 print:p-0 print:overflow-visible">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded"></div>)}
          </div>
        ) : (reportMode === 'bulan' ? reportData.length === 0 : reportDataRentang.length === 0) ? (
          <div className="py-20 text-center text-slate-500">
            Pilih kelas yang memiliki data siswa.
          </div>
        ) : (
          <div className="print-landscape">
            {reportMode === 'bulan' ? (
              <table className="w-full text-xs text-left print-table border-collapse">
                <thead className="text-slate-600 uppercase bg-slate-50 border border-slate-200 text-center print:text-black print:border-black">
                  <tr>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-200 w-8">No</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-200 w-16">NIS</th>
                    <th rowSpan={2} className="px-4 py-2 border border-slate-200 text-left min-w-[150px]">Nama Siswa</th>
                    <th colSpan={datesInMonth.length} className="px-2 py-1 border border-slate-200">Tanggal</th>
                    <th colSpan={4} className="px-2 py-1 border border-slate-200">Jumlah</th>
                    <th rowSpan={2} className="px-2 py-2 border border-slate-200 w-12">%</th>
                  </tr>
                  <tr>
                    {datesInMonth.map(d => (
                      <th key={d} className="px-1 py-1 border border-slate-200 w-6 font-mono font-medium">
                        {parseInt(d.split('-')[2])}
                      </th>
                    ))}
                    <th className="px-1 py-1 border border-slate-200 text-emerald-600 print:text-black">H</th>
                    <th className="px-1 py-1 border border-slate-200 text-amber-600 print:text-black">S</th>
                    <th className="px-1 py-1 border border-slate-200 text-sky-600 print:text-black">I</th>
                    <th className="px-1 py-1 border border-slate-200 text-rose-600 print:text-black">A</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 print:text-black">
                  {reportData.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                      <td className="px-2 py-1.5 border border-slate-200 text-center">{idx + 1}</td>
                      <td className="px-2 py-1.5 border border-slate-200 font-mono text-center">{item.nis}</td>
                      <td className="px-4 py-1.5 border border-slate-200 font-medium whitespace-nowrap">{item.nama}</td>
                      
                      {item.dailyStatus.map((status, i) => (
                        <td key={i} className="px-1 py-1.5 border border-slate-200 text-center font-medium">
                          <span className={cn(
                            status === 'H' ? "text-emerald-600 print:text-black" :
                            status === 'S' ? "text-amber-500 print:text-black" :
                            status === 'I' ? "text-sky-500 print:text-black" :
                            status === 'T' ? "text-purple-600 font-bold print:text-black" :
                            status === 'A' ? "text-rose-500 print:text-black" : "text-slate-300 print:text-black"
                          )}>
                            {status}
                          </span>
                        </td>
                      ))}

                      <td className="px-1 py-1.5 border border-slate-200 text-center font-bold text-emerald-700 print:text-black">{item.summary.h > 0 ? item.summary.h : ''}</td>
                      <td className="px-1 py-1.5 border border-slate-200 text-center font-bold text-amber-600 print:text-black">{item.summary.s > 0 ? item.summary.s : ''}</td>
                      <td className="px-1 py-1.5 border border-slate-200 text-center font-bold text-sky-600 print:text-black">{item.summary.i > 0 ? item.summary.i : ''}</td>
                      <td className="px-1 py-1.5 border border-slate-200 text-center font-bold text-rose-600 print:text-black">{item.summary.a > 0 ? item.summary.a : ''}</td>
                      <td className="px-1 py-1.5 border border-slate-200 text-center font-bold">{item.summary.percentHadir}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm text-left print-table border-collapse">
                <thead className="text-slate-600 uppercase bg-slate-50 border border-slate-200 text-center print:text-black print:border-black">
                  <tr>
                    <th className="px-3 py-2 border border-slate-200 w-12">No</th>
                    <th className="px-3 py-2 border border-slate-200 w-24">NIS</th>
                    <th className="px-4 py-2 border border-slate-200 text-left min-w-[200px]">Nama Siswa</th>
                    <th className="px-4 py-2 border border-slate-200 text-left">Bulan</th>
                    <th className="px-3 py-2 border border-slate-200 w-12 text-emerald-600 print:text-black">H</th>
                    <th className="px-3 py-2 border border-slate-200 w-12 text-amber-600 print:text-black">S</th>
                    <th className="px-3 py-2 border border-slate-200 w-12 text-sky-600 print:text-black">I</th>
                    <th className="px-3 py-2 border border-slate-200 w-12 text-rose-600 print:text-black">A</th>
                    <th className="px-3 py-2 border border-slate-200 w-16">%</th>
                    <th className="px-4 py-2 border border-slate-200 text-left min-w-[260px]">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 print:text-black">
                  {reportDataRentang.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      {item.monthlySummary.map((m, mIdx) => (
                        <tr key={m.label} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                          {mIdx === 0 && (
                            <>
                              <td rowSpan={item.monthlySummary.length + 1} className="px-3 py-2 border border-slate-200 text-center align-top">{idx + 1}</td>
                              <td rowSpan={item.monthlySummary.length + 1} className="px-3 py-2 border border-slate-200 font-mono text-center align-top">{item.nis}</td>
                              <td rowSpan={item.monthlySummary.length + 1} className="px-4 py-2 border border-slate-200 font-medium align-top">{item.nama}</td>
                            </>
                          )}
                          <td className="px-4 py-2 border border-slate-200">{m.label}</td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-medium">{m.h > 0 ? m.h : '-'}</td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-medium">{m.s > 0 ? m.s : '-'}</td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-medium">{m.i > 0 ? m.i : '-'}</td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-medium">{m.a > 0 ? m.a : '-'}</td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-medium">{m.percent}%</td>
                          <td className="px-4 py-2 border border-slate-200 text-xs text-left">
                            {m.notes.length > 0 ? (
                              <div className="space-y-1">
                                {m.notes.map((n, nIdx) => (
                                  <div key={nIdx} className="leading-snug">
                                    <span className="font-semibold text-slate-800">{nIdx + 1}. Tanggal {n.dateFormatted}</span>{' '}
                                    <span className={cn(
                                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                      n.status === 'Sakit' ? "bg-amber-100 text-amber-800 print:text-black" :
                                      n.status === 'Izin' ? "bg-sky-100 text-sky-800 print:text-black" :
                                      n.status === 'TTS' ? "bg-purple-100 text-purple-800 print:text-black" :
                                      "bg-rose-100 text-rose-800 print:text-black"
                                    )}>
                                      {n.status}
                                    </span>
                                    {n.note ? <span className="text-slate-600">: {n.note}</span> : ''}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50/80 font-bold print:bg-transparent">
                        <td colSpan={1} className="px-4 py-2 border border-slate-200 text-right">TOTAL</td>
                        <td className="px-3 py-2 border border-slate-200 text-center text-emerald-700 print:text-black">{item.summary.h > 0 ? item.summary.h : '-'}</td>
                        <td className="px-3 py-2 border border-slate-200 text-center text-amber-700 print:text-black">{item.summary.s > 0 ? item.summary.s : '-'}</td>
                        <td className="px-3 py-2 border border-slate-200 text-center text-sky-700 print:text-black">{item.summary.i > 0 ? item.summary.i : '-'}</td>
                        <td className="px-3 py-2 border border-slate-200 text-center text-rose-700 print:text-black">{item.summary.a > 0 ? item.summary.a : '-'}</td>
                        <td className="px-3 py-2 border border-slate-200 text-center">{item.summary.percentHadir}%</td>
                        <td className="px-4 py-2 border border-slate-200 text-center text-slate-400 font-normal">-</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {/* LEMBAR PENGESAHAN */}
            <div className="mt-16 print-break-inside-avoid">
              <div className="flex justify-end mb-4">
                <p className="text-sm">{schoolInfo?.kota || 'Kab. Bandung'}, {printDateStr}</p>
              </div>
              <div className="grid grid-cols-3 gap-8 text-sm text-center">
                <div>
                  <p className="mb-16">Kepala Sekolah</p>
                  <p className="font-bold underline">{schoolInfo?.kepala_sekolah || 'H.M. Luthfi Almanfaluthi, S.T.,M.Pd.'}</p>
                  <p>NIP. {schoolInfo?.nip_kepala || '..........................'}</p>
                </div>
                <div>
                  <p className="mb-16">Wakasek Kesiswaan</p>
                  <p className="font-bold underline">{schoolInfo?.wakil_kesiswaan || 'Asep Lukman, S.Pd.,Gr'}</p>
                  <p>NIP. {schoolInfo?.nip_wakil || '..........................'}</p>
                </div>
                <div>
                  <p className="mb-16">Wali Kelas {activeClass}</p>
                  <p className="font-bold underline">{activeWali?.nama || 'Ute Juli Kurnia, S.T.,Gr.'}</p>
                  <p>NIP. {activeWali?.nip || '..........................'}</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
