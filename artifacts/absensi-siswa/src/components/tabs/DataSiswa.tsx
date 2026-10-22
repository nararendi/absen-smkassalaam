import { useState, useRef, useMemo } from 'react';
import { Download, Upload, Plus, School, Trash2, Edit2, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClasses, useStudents, useUpsertStudent, useDeleteStudent, useCreateClass } from '@/lib/queries';
import { cn, downloadCSV } from '@/lib/utils';
import type { Student, Class } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import StudentModal from '@/components/modals/StudentModal';
import ClassModal from '@/components/modals/ClassModal';
import ConfirmDeleteModal from '@/components/modals/ConfirmDeleteModal';

export default function DataSiswa() {
  const { data: classes = [], isLoading: loadingClasses } = useClasses();
  const { data: students = [], isLoading: loadingStudents } = useStudents();
  const deleteStudent = useDeleteStudent();
  const upsertStudent = useUpsertStudent();
  const createClass = useCreateClass();
  const { toast } = useToast();
  
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (selectedClass !== 'ALL' && s.kelas !== selectedClass) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
      }
      return true;
    });
  }, [students, selectedClass, searchQuery]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { NIS: "1011", "Nama Siswa": "Ahmad Budi", Kelas: "10A", "Jenis Kelamin": "L" },
      { NIS: "1012", "Nama Siswa": "Siti Aminah", Kelas: "10A", "Jenis Kelamin": "P" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_siswa.xlsx';
    link.click();
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        
        // Auto-create any classes from Excel that don't exist yet
        const uniqueClassNames = [...new Set(
          data.map((row: any) => (row['Kelas'] || row['kelas'])?.toString().trim()).filter(Boolean)
        )];
        const existingClassNames = new Set(classes.map(c => c.name));
        for (const className of uniqueClassNames) {
          if (!existingClassNames.has(className)) {
            try {
              await createClass.mutateAsync(className);
              existingClassNames.add(className); // prevent duplicate inserts within same import
            } catch {
              // Ignore if already exists (e.g. concurrent import)
            }
          }
        }

        let successCount = 0;
        
        // Use a traditional loop to wait for all mutations (could be parallelized but simple is fine)
        for (const row of data) {
          const nis = row['NIS']?.toString() || row['nis']?.toString();
          const nama = row['Nama Siswa'] || row['Nama'] || row['nama'];
          const kelas = row['Kelas'] || row['kelas'];
          let gender = row['Jenis Kelamin'] || row['Gender'] || row['gender'] || 'L';
          
          if (gender.toString().toUpperCase().startsWith('P')) gender = 'P';
          else gender = 'L';

          if (nis && nama && kelas) {
            // Find if existing
            const existing = students.find(s => s.nis === nis);
            await upsertStudent.mutateAsync({
              id: existing?.id,
              nis,
              nama,
              kelas: kelas.toString(),
              gender: gender as 'L' | 'P'
            });
            successCount++;
          }
        }
        
        toast({ title: `Berhasil mengimpor ${successCount} siswa` });
      } catch (error) {
        console.error(error);
        toast({ title: 'Gagal mengimpor file', variant: 'destructive' });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const confirmDelete = (student: Student) => {
    setStudentToDelete(student);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = () => {
    if (studentToDelete) {
      deleteStudent.mutate(studentToDelete.id);
      setDeleteConfirmOpen(false);
      setStudentToDelete(null);
    }
  };

  const openAddStudent = () => {
    setStudentToEdit(null);
    setIsStudentModalOpen(true);
  };

  const openEditStudent = (student: Student) => {
    setStudentToEdit(student);
    setIsStudentModalOpen(true);
  };

  const isLoading = loadingClasses || loadingStudents;

  return (
    <div className="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      {/* ACTION BAR */}
      <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-white flex flex-wrap gap-4 justify-between items-center">
        <div className="flex gap-2">
          <button 
            onClick={handleDownloadTemplate}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Template Excel</span>
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx,.xls,.csv" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import Excel</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setIsClassModalOpen(true)}
            className="px-3 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-transparent rounded-md flex items-center gap-2"
          >
            <School className="w-4 h-4" />
            <span>Kelola Kelas</span>
          </button>
          <button 
            onClick={openAddStudent}
            className="px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 border border-transparent rounded-md shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Siswa</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setSelectedClass('ALL'); setCurrentPage(1); }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors border",
              selectedClass === 'ALL' 
                ? "bg-slate-800 text-white border-slate-800" 
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
            )}
          >
            Semua Kelas
          </button>
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelectedClass(c.name); setCurrentPage(1); }}
              className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors border",
              selectedClass === c.name 
                ? "bg-primary text-white border-primary" 
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
            )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 shadow-sm w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Cari siswa..." 
            className="py-2 w-full text-sm outline-none bg-transparent"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto min-h-0 relative">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg"></div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-lg font-medium text-slate-900">Belum ada data</p>
            <p className="text-sm mt-1">Silakan tambah siswa atau import dari Excel.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="px-4 py-3 font-semibold w-12 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">No</th>
                <th className="px-4 py-3 font-semibold w-32 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">NIS</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Nama Lengkap</th>
                <th className="px-4 py-3 font-semibold w-24 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Kelas</th>
                <th className="px-4 py-3 font-semibold w-32 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">L / P</th>
                <th className="px-4 py-3 font-semibold w-24 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.nama}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">
                      {s.kelas}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold",
                      s.gender === 'L' ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                    )}>
                      {s.gender}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => openEditStudent(s)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => confirmDelete(s)}
                        className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {filteredStudents.length > pageSize && (
        <div className="shrink-0 p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredStudents.length)} dari {filteredStudents.length} siswa
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              Sebelumnya
            </button>
            <span className="font-medium text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {isStudentModalOpen && (
        <StudentModal 
          isOpen={isStudentModalOpen} 
          onClose={() => setIsStudentModalOpen(false)} 
          student={studentToEdit} 
          classes={classes}
        />
      )}
      
      {isClassModalOpen && (
        <ClassModal 
          isOpen={isClassModalOpen} 
          onClose={() => setIsClassModalOpen(false)} 
        />
      )}

      {deleteConfirmOpen && (
        <ConfirmDeleteModal 
          isOpen={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={executeDelete}
          title="Hapus Data Siswa"
          message={`Yakin ingin menghapus ${studentToDelete?.nama}? Data absensi yang terkait juga mungkin akan terhapus atau kehilangan relasi.`}
        />
      )}
    </div>
  );
}
