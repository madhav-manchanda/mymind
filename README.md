# CloudVault

CloudVault is a modern, premium cloud storage web application inspired by Google Drive. It provides a secure, fast, and beautiful interface for managing your files and folders in the cloud. 

Built with **React**, **Vite**, and **Supabase**, CloudVault features a complete authentication flow, real-time database synchronization, and secure file storage.

## ✨ Features

- **Advanced Authentication:** Full email and password sign-up flow, complete with 6-digit OTP email verification and a secure password reset workflow.
- **File Management:** Upload, download, rename, preview, and permanently delete files.
- **Folder Organization:** Create nested folders, rename folders, and seamlessly navigate your directory structure.
- **Premium UI/UX:** A stunning "Liquid Glass" inspired interface with smooth CSS animations, context menus (right-click), and interactive drag-and-drop zones.
- **Upload Progress Panel:** Google Drive-style bottom-right upload panel with real-time percentage tracking, minimize/expand options, and status icons.
- **Quick Access:** Mark important files with "Stars" and manage deleted items in the "Trash" bin.
- **Secure Backend:** Powered by Supabase with strict PostgreSQL Row Level Security (RLS) ensuring your data is completely isolated and private.

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Vanilla CSS (Custom Design System)
- **Icons:** Lucide-React
- **Backend & Auth:** Supabase (PostgreSQL, Storage, GoTrue Auth)

## 🚀 Local Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/cloudvault.git
cd cloudvault
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
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Supabase Configuration
Create a `.env` file in the root directory of the project and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Database Setup
Run the following SQL script in your Supabase SQL Editor to create the required tables and Row Level Security (RLS) policies:

```sql
-- 1. Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create tables
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  starred BOOLEAN DEFAULT FALSE,
  trashed BOOLEAN DEFAULT FALSE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

-- 4. Table Policies
CREATE POLICY "Users can CRUD own folders" ON public.folders FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can CRUD own files" ON public.file_metadata FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 5. Storage Policies (For the 'user-files' bucket)
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 5. Email Templates Setup
To make the 6-digit OTP verification work, go to **Supabase Dashboard** → **Authentication** → **Email Templates**.

Change your **Confirm Signup** and **Reset Password** templates to use the `{{ .Token }}` variable instead of magic links. 

Example HTML for the email body:
```html
<h2>CloudVault Verification</h2>
<p>Your 6-digit verification code is:</p>
<h1 style="letter-spacing: 5px;">{{ .Token }}</h1>
```

### 6. Start the Application
```bash
npm run dev
```

## 📝 License
This project is open-source and available under the MIT License.
