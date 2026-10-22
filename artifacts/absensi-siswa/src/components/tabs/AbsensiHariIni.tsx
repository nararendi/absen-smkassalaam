import { useState, useMemo, useEffect } from 'react';
import { Search, CheckCircle2, RotateCcw, Users } from 'lucide-react';
import { useClasses, useStudents, useAttendance, useUpsertAttendance, useDeleteAttendance, useBulkUpsertAttendance, useBulkDeleteAttendance } from '@/lib/queries';
import { cn, formatShortDate } from '@/lib/utils';
import type { AttendanceStatus, Student } from '@/types/database';

export default function AbsensiHariIni() {
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: classes = [], isLoading: loadingClasses } = useClasses();
  const { data: students = [], isLoading: loadingStudents } = useStudents();
  const { data: attendance = [], isLoading: loadingAttendance } = useAttendance(selectedDate);
  
  const upsertAttendance = useUpsertAttendance();
  const deleteAttendance = useDeleteAttendance();
  const bulkUpsert = useBulkUpsertAttendance();
  const bulkDelete = useBulkDeleteAttendance();

  // Filter students based on class and search
  const filteredStudents = useMemo(() => {
    let result = students;
    if (selectedClass !== 'ALL') {
      result = result.filter(s => s.kelas === selectedClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q));
    }
    return result;
  }, [students, selectedClass, searchQuery]);

  // Map attendance records to a dictionary for fast lookup
  const attendanceMap = useMemo(() => {
    const map: Record<string, { id: string; status: AttendanceStatus; note: string }> = {};
    attendance.forEach(r => {
      map[r.student_id] = { id: r.id, status: r.status, note: r.note || '' };
    });
    return map;
  }, [attendance]);

  // Calculate stats
  const stats = useMemo(() => {
    let hadir = 0, sakit = 0, izin = 0, alpa = 0, sim = 0;
    filteredStudents.forEach(s => {
      const status = attendanceMap[s.id]?.status;
      if (status === 'Hadir') hadir++;
      else if (status === 'Sakit') sakit++;
      else if (status === 'Izin') izin++;
      else if (status === 'Alpa') alpa++;
      else if (status === 'SIM' || status === 'TTS') sim++;
    });
    const total = filteredStudents.length;
    const filled = hadir + sakit + izin + alpa + sim;
    return { total, filled, hadir, sakit, izin, alpa, sim, percentHadir: total ? Math.round(((hadir + sim) / total) * 100) : 0 };
  }, [filteredStudents, attendanceMap]);

  const handleStatusToggle = (studentId: string, status: AttendanceStatus) => {
    const current = attendanceMap[studentId];
    if (current?.status === status || (status === 'SIM' && current?.status === 'TTS')) {
      // Toggle off -> Delete record
      deleteAttendance.mutate({ id: current.id, date: selectedDate });
    } else {
      // Create or update
      let newNote = current?.note || '';
      if (status === 'SIM') {
        // Auto-fill 'Hadir Tidak Tap SIM' if note is empty or was previous default
        if (!newNote || newNote.trim() === '' || newNote === 'Tidak Tap SIM') {
          newNote = 'Hadir Tidak Tap SIM';
        }
      } else if ((current?.status === 'SIM' || current?.status === 'TTS') && (newNote === 'Hadir Tidak Tap SIM' || newNote === 'Tidak Tap SIM')) {
        // Clear default auto-note if changing away from SIM
        newNote = '';
      }

      upsertAttendance.mutate({
        date: selectedDate,
        student_id: studentId,
        status,
        note: newNote
      });
    }
  };

  const handleNoteChange = (studentId: string, note: string) => {
    const current = attendanceMap[studentId];
    if (current && current.note !== note) {
      upsertAttendance.mutate({
        date: selectedDate,
        student_id: studentId,
        status: current.status,
        note
      });
    }
  };

  const markAllPresent = () => {
    const unrecorded = filteredStudents.filter(s => !attendanceMap[s.id]);
    if (unrecorded.length === 0) return;
    bulkUpsert.mutate({
      date: selectedDate,
      records: unrecorded.map(s => ({
        student_id: s.id,
        status: 'Hadir',
        note: ''
      }))
    });
  };

  const resetAll = () => {
    if (confirm('Yakin ingin mereset semua absensi yang tampil pada hari ini?')) {
      const idsToDelete = filteredStudents
        .map(s => attendanceMap[s.id]?.id)
        .filter((id): id is string => Boolean(id));
      if (idsToDelete.length === 0) return;
      bulkDelete.mutate({ date: selectedDate, ids: idsToDelete });
    }
  };

  const isLoading = loadingClasses || loadingStudents || loadingAttendance;

  return (
    <div className="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      {/* TOOLBAR */}
      <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari nama / NIS..." 
              className="py-2 w-full sm:w-48 text-sm outline-none bg-transparent"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          <select 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
          >
            <option value="ALL">Semua Kelas</option>
            {classes.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <input 
            type="date" 
            className="py-2 px-3 bg-white border border-slate-200 rounded-md text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={resetAll}
            className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button 
            onClick={markAllPresent}
            className="px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 border border-transparent rounded-md shadow-sm flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Hadirkan Semua</span>
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-slate-200 bg-white flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Total Siswa:</span>
          <span className="font-semibold text-slate-900">{stats.total}</span>
        </div>
        <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-slate-500">Hadir:</span>
          <span className="font-semibold text-emerald-700">{stats.hadir} ({stats.percentHadir}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span className="text-slate-500">Sakit:</span>
          <span className="font-semibold text-amber-700">{stats.sakit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
          <span className="text-slate-500">Izin:</span>
          <span className="font-semibold text-sky-700">{stats.izin}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span className="text-slate-500">Alpa:</span>
          <span className="font-semibold text-rose-700">{stats.alpa}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          <span className="text-slate-500">SIM:</span>
          <span className="font-semibold text-purple-700">{stats.sim}</span>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto min-h-0 relative">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-lg"></div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg font-medium text-slate-900">Tidak ada data siswa</p>
            <p className="text-sm mt-1">Pilih kelas yang berbeda atau tambah siswa di tab Data Siswa.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="px-4 py-3 font-semibold w-12 text-center bg-slate-50 border-b border-slate-200 sticky top-0 z-10">No</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Siswa</th>
                {selectedClass === 'ALL' && <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Kelas</th>}
                <th className="px-4 py-3 font-semibold w-64 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Status Kehadiran</th>
                <th className="px-4 py-3 font-semibold w-64 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s, idx) => {
                const currentRecord = attendanceMap[s.id];
                const status = currentRecord?.status;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-4 py-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{s.nama}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.nis} • {s.gender}</div>
                    </td>
                    {selectedClass === 'ALL' && (
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                          {s.kelas}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 rounded-lg inline-flex">
                        <StatusButton 
                          label="H" 
                          active={status === 'Hadir'} 
                          colorClass="bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-600" 
                          idleClass="text-slate-600 hover:bg-slate-200 bg-white border-slate-200"
                          onClick={() => handleStatusToggle(s.id, 'Hadir')}
                          tooltip="Hadir"
                        />
                        <StatusButton 
                          label="S" 
                          active={status === 'Sakit'} 
                          colorClass="bg-amber-500 text-white hover:bg-amber-600 border-amber-600" 
                          idleClass="text-slate-600 hover:bg-slate-200 bg-white border-slate-200"
                          onClick={() => handleStatusToggle(s.id, 'Sakit')}
                          tooltip="Sakit"
                        />
                        <StatusButton 
                          label="I" 
                          active={status === 'Izin'} 
                          colorClass="bg-sky-500 text-white hover:bg-sky-600 border-sky-600" 
                          idleClass="text-slate-600 hover:bg-slate-200 bg-white border-slate-200"
                          onClick={() => handleStatusToggle(s.id, 'Izin')}
                          tooltip="Izin"
                        />
                        <StatusButton 
                          label="A" 
                          active={status === 'Alpa'} 
                          colorClass="bg-rose-500 text-white hover:bg-rose-600 border-rose-600" 
                          idleClass="text-slate-600 hover:bg-slate-200 bg-white border-slate-200"
                          onClick={() => handleStatusToggle(s.id, 'Alpa')}
                          tooltip="Alpa"
                        />
                        <StatusButton 
                          label="SIM" 
                          active={status === 'SIM' || status === 'TTS'} 
                          colorClass="bg-purple-600 text-white hover:bg-purple-700 border-purple-700" 
                          idleClass="text-slate-600 hover:bg-slate-200 bg-white border-slate-200"
                          onClick={() => handleStatusToggle(s.id, 'SIM')}
                          tooltip="SIM (Hadir Tidak Tap SIM)"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <NoteInput 
                        value={currentRecord?.note || ''} 
                        onChange={(val) => handleNoteChange(s.id, val)}
                        disabled={!status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* FOOTER */}
      <div className="shrink-0 p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Terisi: <strong className="text-slate-900">{stats.filled}</strong> / {stats.total} siswa
        </span>
        <span className="text-slate-400">
          {formatShortDate(selectedDate)}
        </span>
      </div>
    </div>
  );
}

function StatusButton({ label, active, colorClass, idleClass, onClick, tooltip }: { 
  label: string; 
  active: boolean; 
  colorClass: string; 
  idleClass: string; 
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        "h-8 rounded flex items-center justify-center font-semibold border transition-all duration-200",
        label.length > 1 ? "px-2 min-w-[34px] text-[11px]" : "w-8 text-xs",
        active ? colorClass + " shadow-sm scale-105" : idleClass
      )}
    >
      {label}
    </button>
  );
}

// Simple debounced input for notes to prevent too many requests
function NoteInput({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled: boolean }) {
  const [localValue, setLocalValue] = useState(value);

  // Sync when prop changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <input
      type="text"
      placeholder={disabled ? "Pilih status dulu" : "Keterangan..."}
      className="w-full text-sm py-1.5 px-3 bg-white border border-slate-200 rounded-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 disabled:bg-slate-100 disabled:text-slate-400 transition-all"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      disabled={disabled}
      onKeyDown={e => {
        if (e.key === 'Enter') handleBlur();
      }}
    />
  );
}
