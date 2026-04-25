import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
        Golazo ⚽
      </h1>
      <p className="max-w-md text-center text-lg text-muted-foreground">
        La polla deportiva multijugador para el Mundial 2026 y más allá.
        Predice, compite y demuestra quién es el verdadero experto.
      </p>
      <div className="flex gap-3">
        <Button size="lg">Crear Polla</Button>
        <Button size="lg" variant="outline">
          Unirme a una Polla
        </Button>
      </div>
    </main>
  );
}
