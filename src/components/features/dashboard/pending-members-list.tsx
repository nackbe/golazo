'use client';

import { useState, useTransition, useEffect } from 'react';
import { Loader2, Check, X, UserCheck } from 'lucide-react';
import { approveMember, rejectMember, getPendingMembers } from '@/app/(dashboard)/pollas/[id]/configurar/actions';

interface Member {
  id: string;
  alias: string;
  created_at: string;
}

export function PendingMembersList({ pollaId, members: initial }: { pollaId: string; members: Member[] }) {
  const [members, setMembers] = useState<Member[]>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setMembers(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    getPendingMembers(pollaId).then((result) => {
      if (!cancelled && result.members) {
        setMembers(result.members);
      }
    });
    return () => { cancelled = true; };
  }, [pollaId]);

  const handleApprove = (memberId: string) => {
    setPending(memberId);
    startTransition(async () => {
      await approveMember(pollaId, memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setPending(null);
    });
  };

  const handleReject = (memberId: string) => {
    setPending(memberId);
    startTransition(async () => {
      await rejectMember(pollaId, memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setPending(null);
    });
  };

  if (members.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <UserCheck className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-bold text-base">Solicitudes pendientes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {members.length} {members.length === 1 ? 'persona quiere' : 'personas quieren'} unirse
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {members.map(m => (
          <li key={m.id} className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary flex-shrink-0">
              {m.alias.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{m.alias}</p>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {new Date(m.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleReject(m.id)}
                disabled={pending === m.id}
                title="Rechazar"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
              >
                {pending === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
              <button
                onClick={() => handleApprove(m.id)}
                disabled={pending === m.id}
                title="Aprobar"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-green-700 transition-colors hover:bg-green-500/20 disabled:opacity-50"
              >
                {pending === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
