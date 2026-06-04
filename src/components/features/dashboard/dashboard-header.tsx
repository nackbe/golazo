'use client';

import Link from 'next/link';
import { LogOut, Trophy, UserCircle } from 'lucide-react';
import { logout } from '@/app/(dashboard)/actions';

interface DashboardHeaderProps {
  alias: string | null;
  avatarUrl: string | null;
  email: string;
}

export function DashboardHeader({ alias, avatarUrl, email }: DashboardHeaderProps) {
  const displayName = alias || email.split('@')[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="bg-primary-dark text-white shadow-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">

        <div className="flex items-center gap-8">
          <Link href="/pollas" className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-black tracking-tight">Golazo</span>
          </Link>
          <nav className="hidden gap-6 sm:flex">
            <Link
              href="/pollas"
              className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
            >
              <Trophy className="h-4 w-4" />
              Mis Pollas
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/perfil"
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">
                {initials}
              </div>
            )}
            <span className="hidden font-medium sm:inline">{displayName}</span>
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </form>
        </div>

      </div>
    </header>
  );
}
