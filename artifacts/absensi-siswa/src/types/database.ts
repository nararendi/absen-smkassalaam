export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' | 'SIM' | 'TTS';
export type Gender = 'L' | 'P';
export type UserRole = 'admin' | 'petugas';

export interface Database {
  public: {
    Tables: {
      classes: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
      };
      students: {
        Row: { id: string; nis: string; nama: string; kelas: string; gender: Gender; created_at: string };
        Insert: { id?: string; nis: string; nama: string; kelas: string; gender: Gender; created_at?: string };
        Update: { id?: string; nis?: string; nama?: string; kelas?: string; gender?: Gender; created_at?: string };
      };
      attendance_records: {
        Row: { id: string; date: string; student_id: string; status: AttendanceStatus; note: string; created_at: string };
        Insert: { id?: string; date: string; student_id: string; status: AttendanceStatus; note?: string; created_at?: string };
        Update: { id?: string; date?: string; student_id?: string; status?: AttendanceStatus; note?: string; created_at?: string };
      };
      school_info: {
        Row: { id: string; nama_sekolah: string; kota: string; kepala_sekolah: string; nip_kepala: string; wakil_kesiswaan: string; nip_wakil: string; updated_at: string };
        Insert: { id?: string; nama_sekolah?: string; kota?: string; kepala_sekolah?: string; nip_kepala?: string; wakil_kesiswaan?: string; nip_wakil?: string; updated_at?: string };
        Update: { id?: string; nama_sekolah?: string; kota?: string; kepala_sekolah?: string; nip_kepala?: string; wakil_kesiswaan?: string; nip_wakil?: string; updated_at?: string };
      };
      wali_kelas: {
        Row: { id: string; kelas: string; nama: string; nip: string; updated_at: string };
        Insert: { id?: string; kelas: string; nama?: string; nip?: string; updated_at?: string };
        Update: { id?: string; kelas?: string; nama?: string; nip?: string; updated_at?: string };
      };
      petugas: {
        Row: { id: string; nama: string; email: string; password: string; role: UserRole; created_at: string };
        Insert: { id?: string; nama: string; email: string; password: string; role?: UserRole; created_at?: string };
        Update: { id?: string; nama?: string; email?: string; password?: string; role?: UserRole; created_at?: string };
      };
    };
  };
}

export type Class = Database['public']['Tables']['classes']['Row'];
export type Student = Database['public']['Tables']['students']['Row'];
export type AttendanceRecord = Database['public']['Tables']['attendance_records']['Row'];
export type SchoolInfo = Database['public']['Tables']['school_info']['Row'];
export type WaliKelas = Database['public']['Tables']['wali_kelas']['Row'];
export type Petugas = Database['public']['Tables']['petugas']['Row'];
