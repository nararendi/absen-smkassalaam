import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Login from '@/pages/Login';
import type { Petugas } from '@/types/database';

const AbsensiApp = lazy(() => import('@/pages/AbsensiApp'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 menit: data di-cache, hindari spam network berulang
      gcTime: 1000 * 60 * 30, // 30 menit di memori
      refetchOnWindowFocus: false, // JANGAN refetch otomatis setiap kali pindah tab/window (penyebab utama lag di laptop lemah)
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function App() {
  const [currentUser, setCurrentUser] = useState<Petugas | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Bersihkan sesi lama dari localStorage agar tidak tersimpan permanen
    localStorage.removeItem('petugas_session');
    localStorage.removeItem('petugas_auth');

    // Gunakan sessionStorage: sesi hanya bertahan selama tab browser aktif.
    // Setiap kali browser/tab dibuka kembali, user diwajibkan login ulang.
    const stored = sessionStorage.getItem('petugas_session');
    if (stored) {
      try {
        setCurrentUser(JSON.parse(stored) as Petugas);
      } catch {
        sessionStorage.removeItem('petugas_session');
      }
    }
    setIsChecking(false);
  }, []);

  const handleLoginSuccess = (petugas: Petugas) => {
    setCurrentUser(petugas);
    sessionStorage.setItem('petugas_session', JSON.stringify(petugas));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('petugas_session');
    localStorage.removeItem('petugas_session');
    localStorage.removeItem('petugas_auth');
  };

  if (isChecking) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {!currentUser ? (
          <Login onSuccess={handleLoginSuccess} />
        ) : (
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm font-medium text-slate-500">Memuat aplikasi...</p>
              </div>
            </div>
          }>
            <AbsensiApp currentUser={currentUser} onLogout={handleLogout} />
          </Suspense>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
