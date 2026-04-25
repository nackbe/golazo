import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Trophy, Users, Zap, Globe, Shield, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If already logged in, redirect to dashboard
  if (user) {
    redirect('/pollas');
  }

  const features = [
    {
      icon: <Trophy className="h-6 w-6 text-primary" />,
      title: 'Predice y gana',
      desc: 'Apuesta marcadores, resultados y predicciones especiales de torneo.',
    },
    {
      icon: <Users className="h-6 w-6 text-primary" />,
      title: 'Juega con amigos',
      desc: 'Crea pollas privadas, invita con código o QR y compite en grupo.',
    },
    {
      icon: <Zap className="h-6 w-6 text-primary" />,
      title: 'Comodines estratégicos',
      desc: 'Usa multiplicadores x2 y x3 en los partidos que más confianza tengas.',
    },
    {
      icon: <Globe className="h-6 w-6 text-primary" />,
      title: 'Mundial 2026 ready',
      desc: 'Fixture completo, resultados en vivo y ranking actualizado al instante.',
    },
    {
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: 'Sin trampas',
      desc: 'Predicciones se bloquean automáticamente antes del partido. Sin excusas.',
    },
    {
      icon: <TrendingUp className="h-6 w-6 text-primary" />,
      title: 'Evolución del ranking',
      desc: 'Gráficas de cómo subes y bajas partido a partido.',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <span className="text-primary">Golazo</span>
            <span>⚽</span>
          </Link>
          <nav>
            <Link href="/login">
              <Button variant="outline" size="sm">
                Iniciar sesión
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            La polla deportiva{' '}
            <span className="text-primary">definitiva</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Predice resultados, compite con tus amigos y demuestra quién es el
            verdadero experto del Mundial 2026.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Crear una Polla
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Unirme a una Polla
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Sin app nativa. Funciona desde tu navegador como PWA.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/50 px-4 py-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold">
            ¿Por qué Golazo?
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border bg-background p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3">{f.icon}</div>
                <h3 className="mb-1 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 text-center">
        <div className="mx-auto max-w-xl space-y-4">
          <h2 className="text-2xl font-bold">¿Listo para demostrar quién sabe más de fútbol?</h2>
          <p className="text-muted-foreground">
            Crea tu polla en segundos. Invita a tus amigos. Que empiece la competencia.
          </p>
          <Link href="/login">
            <Button size="lg">Empezar ahora</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>© 2026 Golazo. Hecho para fanáticos del fútbol.</p>
      </footer>
    </div>
  );
}
