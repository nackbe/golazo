'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const BASE = 'https://api.dicebear.com/9.x/pixel-art/svg';

function av(id: string, seed: string, bg: string) {
  return { id, url: `${BASE}?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}` };
}

// Verde pasto, amarillo pelota, azul cielo, rojo tarjeta
const G = 'bbf7d0'; // verde — posiciones
const Y = 'fef08a'; // amarillo — jugadores famosos
const B = 'bae6fd'; // azul — términos de juego
const R = 'fecaca'; // rojo — roles del Mundial

const AVATARS = [
  // Jugadores famosos — amarillo (10)
  av('p1',  'Messi',       Y), av('p2',  'Ronaldo',    Y),
  av('p3',  'Mbappe',      Y), av('p4',  'Vinicius',   Y),
  av('p5',  'Neymar',      Y), av('p6',  'James',      Y),
  av('p7',  'Falcao',      Y), av('p8',  'Higuita',    Y),
  av('p9',  'Valderrama',  Y), av('p10', 'Suarez',     Y),

  // Posiciones — verde (10)
  av('pos1', 'Goalkeeper', G), av('pos2', 'Striker',   G),
  av('pos3', 'Midfielder', G), av('pos4', 'Defender',  G),
  av('pos5', 'Winger',     G), av('pos6', 'Libero',    G),
  av('pos7', 'Sweeper',    G), av('pos8', 'Playmaker', G),
  av('pos9', 'Targetman',  G), av('pos10','Captain',   G),

  // Términos de juego — azul (10)
  av('t1',  'Corner',     B), av('t2',  'Penalty',   B),
  av('t3',  'FreeKick',   B), av('t4',  'Header',    B),
  av('t5',  'Volley',     B), av('t6',  'Dribble',   B),
  av('t7',  'Tackle',     B), av('t8',  'Assist',    B),
  av('t9',  'Hattrick',   B), av('t10', 'Offside',   B),

  // Roles del Mundial — rojo (10)
  av('w1',  'GoldenBoot',  R), av('w2',  'GoldenGlove', R),
  av('w3',  'Champion',    R), av('w4',  'Finalist',    R),
  av('w5',  'TopScorer',   R), av('w6',  'Coach',       R),
  av('w7',  'Referee',     R), av('w8',  'Legend',      R),
  av('w9',  'Fan',         R), av('w10', 'Icon',        R),
];

function extractAvatarId(url: string | null): string | null {
  if (!url || !url.includes('dicebear.com')) return null;
  return AVATARS.find(a => a.url === url)?.id ?? null;
}

interface Props {
  userId: string;
  initialAlias: string | null;
  initialAvatarUrl: string | null;
  email: string;
}

export function ProfileForm({ userId, initialAlias, initialAvatarUrl, email }: Props) {
  const router = useRouter();
  const [alias, setAlias] = useState(initialAlias ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(extractAvatarId(initialAvatarUrl));
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const displayName = alias || email.split('@')[0];
  const initials = displayName.slice(0, 2).toUpperCase();
  const currentAvatarUrl = AVATARS.find(a => a.id === selectedId)?.url ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim() || alias.trim().length < 2) {
      setError('El alias debe tener al menos 2 caracteres.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ alias: alias.trim(), avatar_url: currentAvatarUrl })
      .eq('id', userId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh(); // actualiza header y server components con datos frescos
    }
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-6">

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          Perfil actualizado.
        </div>
      )}

      {/* Avatar actual */}
      <div className="flex flex-col items-center gap-4">
        <div>
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt="Tu avatar"
              className="h-24 w-24 rounded-full ring-4 ring-primary/20"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground ring-4 ring-primary/20">
              {initials}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          {showPicker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {selectedId ? 'Cambiar avatar' : 'Elegir avatar'}
        </button>
      </div>

      {/* Picker */}
      {showPicker && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground text-center">Tocá un avatar para seleccionarlo</p>
          <div className="grid grid-cols-8 gap-1.5">
            {AVATARS.map((av) => (
              <button
                key={av.id}
                type="button"
                onClick={() => { setSelectedId(av.id); setShowPicker(false); }}
                className={`rounded-xl overflow-hidden transition-all aspect-square ${
                  selectedId === av.id
                    ? 'ring-2 ring-primary ring-offset-2 scale-105'
                    : 'hover:scale-105 hover:ring-2 hover:ring-border'
                }`}
              >
                <img src={av.url} alt="" className="h-full w-full" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Alias */}
      <div className="space-y-1.5">
        <label htmlFor="alias" className="text-sm font-semibold">Tu alias</label>
        <input
          id="alias"
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: ElAdivino"
          minLength={2}
          maxLength={30}
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
        />
        <p className="text-xs text-muted-foreground">Nombre visible en el ranking de todas tus pollas.</p>
      </div>

      {/* Email solo lectura */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-muted-foreground">Email</p>
        <p className="text-sm">{email}</p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          'Guardar cambios'
        )}
      </button>

    </form>
  );
}
