import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center gap-4 px-4">
          <Link href="/pollas" className="font-bold">
            Golazo
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/pollas" className="text-muted-foreground hover:text-foreground">
              Mis Pollas
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
