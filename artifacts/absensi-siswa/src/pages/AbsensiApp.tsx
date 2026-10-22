import { useState, lazy, Suspense } from 'react';
import { BookOpenCheck, Calendar, Users, FileBarChart, LogOut, ShieldCheck } from 'lucide-react';
import AbsensiHariIni from '@/components/tabs/AbsensiHariIni';
import { cn } from '@/lib/utils';
import type { Petugas } from '@/types/database';

const DataSiswa = lazy(() => import('@/components/tabs/DataSiswa'));
const RekapHarian = lazy(() => import('@/components/tabs/RekapHarian'));
const RekapLaporan = lazy(() => import('@/components/tabs/RekapLaporan'));
const ManajemenPetugas = lazy(() => import('@/components/tabs/ManajemenPetugas'));

type Tab = 'hari-ini' | 'data-siswa' | 'rekap-harian' | 'rekap-laporan' | 'manajemen-petugas';

interface AbsensiAppProps {
  currentUser: Petugas;
  onLogout: () => void;
}

export default function AbsensiApp({ currentUser, onLogout }: AbsensiAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('hari-ini');
  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="app-layout h-[100dvh] flex flex-col bg-[#f0f4f8] font-sans overflow-hidden print:h-auto print:overflow-visible print:block">
      {/* HEADER */}
      <header className="no-print bg-gradient-to-r from-[#0a1628] via-[#0f2d5c] to-[#1565c0] text-white shadow-lg shrink-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center h-auto sm:h-16 py-4 sm:py-0 gap-4 sm:gap-0">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center font-display font-bold text-xl shadow-inner" style={{color:'#f59e0b'}}>
                  A
                </div>
                <div>
                  <h1 className="font-display font-bold text-lg leading-tight tracking-wide">AbsensiSiswa</h1>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-blue-200 font-medium tracking-wider uppercase opacity-80">
                      {isAdmin ? 'Admin' : 'Petugas'}: {currentUser.nama}
                    </p>
                    {isAdmin && (
                      <span className="text-xs bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full font-semibold">
                        ADMIN
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="sm:hidden flex items-center justify-center p-2 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto overflow-hidden">
              <nav className="flex space-x-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 hide-scrollbar flex-1">
                <TabButton
                  active={activeTab === 'hari-ini'}
                  onClick={() => setActiveTab('hari-ini')}
                  icon={<BookOpenCheck className="w-4 h-4" />}
                  label="Hari Ini"
                />
                <TabButton
                  active={activeTab === 'rekap-harian'}
                  onClick={() => setActiveTab('rekap-harian')}
                  icon={<Calendar className="w-4 h-4" />}
                  label="Rekap Harian"
                />
                <TabButton
                  active={activeTab === 'rekap-laporan'}
                  onClick={() => setActiveTab('rekap-laporan')}
                  icon={<FileBarChart className="w-4 h-4" />}
                  label="Laporan"
                />
                {isAdmin && (
                  <TabButton
                    active={activeTab === 'data-siswa'}
                    onClick={() => setActiveTab('data-siswa')}
                    icon={<Users className="w-4 h-4" />}
                    label="Data Siswa"
                    isAdmin
                  />
                )}
                {isAdmin && (
                  <TabButton
                    active={activeTab === 'manajemen-petugas'}
                    onClick={() => setActiveTab('manajemen-petugas')}
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="Petugas"
                    isAdmin
                  />
                )}
              </nav>

              <button
                onClick={onLogout}
                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 print:p-0 print:max-w-none print:mx-0 flex flex-col min-h-0 overflow-hidden print:h-auto print:overflow-visible print:block">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden print:shadow-none print:border-0 print:rounded-none print:overflow-visible print:h-auto print:block">
          <Suspense fallback={
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat modul...</p>
            </div>
          }>
            {activeTab === 'hari-ini' && <AbsensiHariIni />}
            {activeTab === 'data-siswa' && isAdmin && <DataSiswa />}
            {activeTab === 'rekap-harian' && <RekapHarian />}
            {activeTab === 'rekap-laporan' && <RekapLaporan />}
            {activeTab === 'manajemen-petugas' && isAdmin && <ManajemenPetugas currentUser={currentUser} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active, onClick, icon, label, isAdmin
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isAdmin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
        active
          ? isAdmin
            ? "bg-amber-400/20 text-amber-300 shadow-sm ring-1 ring-amber-400/30"
            : "bg-white/20 text-white shadow-sm ring-1 ring-white/10"
          : "text-indigo-100 hover:bg-white/10 hover:text-white"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
