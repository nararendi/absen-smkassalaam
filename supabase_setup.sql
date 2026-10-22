-- ============================================================
-- AbsensiSiswa — Supabase SQL Setup
-- Run this in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- 1. Tables
CREATE TABLE IF NOT EXISTS classes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nis text NOT NULL UNIQUE,
  nama text NOT NULL,
  kelas text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('L', 'P')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('Hadir', 'Sakit', 'Izin', 'Alpa', 'SIM', 'TTS')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, student_id)
);

CREATE TABLE IF NOT EXISTS school_info (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_sekolah text DEFAULT '',
  kota text DEFAULT '',
  kepala_sekolah text DEFAULT '',
  nip_kepala text DEFAULT '',
  wakil_kesiswaan text DEFAULT '',
  nip_wakil text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wali_kelas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kelas text NOT NULL UNIQUE,
  nama text DEFAULT '',
  nip text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE wali_kelas ENABLE ROW LEVEL SECURITY;

-- 3. Allow full access via anon key (no auth required for this app)
CREATE POLICY "allow_all" ON classes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON students FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON attendance_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON school_info FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON wali_kelas FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Sample data
INSERT INTO classes (name) VALUES
  ('X IPA 1'), ('X IPA 2'), ('XI IPS 1'), ('XII IPA 1')
ON CONFLICT (name) DO NOTHING;

INSERT INTO students (nis, nama, kelas, gender) VALUES
  ('2024101', 'Aditya Pratama',   'X IPA 1', 'L'),
  ('2024102', 'Anisa Rahmawati',  'X IPA 1', 'P'),
  ('2024103', 'Budi Santoso',     'X IPA 1', 'L'),
  ('2024104', 'Citra Dewi',       'X IPA 1', 'P'),
  ('2024105', 'Dion Permana',     'X IPA 1', 'L'),
  ('2024106', 'Eka Lestari',      'X IPA 1', 'P'),
  ('2024107', 'Fajar Nugraha',    'X IPA 1', 'L'),
  ('2024108', 'Gita Gutawa',      'X IPA 1', 'P'),
  ('2024109', 'Hadi Gunawan',     'X IPA 1', 'L'),
  ('2024110', 'Intan Nuraini',    'X IPA 1', 'P'),
  ('2024201', 'Kiki Ramadhan',    'X IPA 2', 'L'),
  ('2024202', 'Lina Marlina',     'X IPA 2', 'P'),
  ('2024203', 'Muhammad Rizky',   'X IPA 2', 'L')
ON CONFLICT (nis) DO NOTHING;

-- 5. Initial school_info row
INSERT INTO school_info (nama_sekolah, kota, kepala_sekolah, nip_kepala, wakil_kesiswaan, nip_wakil)
VALUES ('', '', '', '', '', '')
ON CONFLICT DO NOTHING;

-- 6. Petugas table (admin & officer accounts)
CREATE TABLE IF NOT EXISTS petugas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama text NOT NULL,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'petugas' CHECK (role IN ('admin', 'petugas')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE petugas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON petugas FOR ALL TO anon USING (true) WITH CHECK (true);

-- Initial admin account
INSERT INTO petugas (nama, email, password, role) VALUES
  ('Aman', 'aman@gmail.com', '12345678', 'admin')
ON CONFLICT (email) DO NOTHING;
