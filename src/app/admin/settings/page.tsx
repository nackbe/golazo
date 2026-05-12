import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Settings, ArrowLeft, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { getAllSettings } from '@/lib/settings';
import { SettingsForm } from './settings-form';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_system_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_system_admin) redirect('/pollas');

  const settings = await getAllSettings();

  const settingsList = [
    {
      key: 'rate_limit_load_fixtures',
      label: 'Cargar fixtures',
      category: 'rate_limit',
      description: 'Límite de cargas de fixtures por usuario por hora',
    },
    {
      key: 'rate_limit_sync_fixtures',
      label: 'Sincronizar fixtures',
      category: 'rate_limit',
      description: 'Límite de sincronizaciones de fixtures por usuario por hora',
    },
    {
      key: 'rate_limit_search_leagues',
      label: 'Buscar ligas',
      category: 'rate_limit',
      description: 'Límite de búsquedas de ligas por IP cada 10 minutos',
    },
    {
      key: 'rate_limit_get_rounds',
      label: 'Consultar rounds',
      category: 'rate_limit',
      description: 'Límite de consultas de rounds por IP por hora',
    },
    {
      key: 'rate_limit_recalculate_points',
      label: 'Recalcular puntos',
      category: 'rate_limit',
      description: 'Límite de recálculos de puntos por usuario cada 10 minutos',
    },
    {
      key: 'max_pollas_per_user',
      label: 'Máximo de pollas por usuario',
      category: 'game',
      description: 'Máximo de pollas que puede crear un usuario',
    },
    {
      key: 'max_fixtures_load',
      label: 'Máximo de partidos a cargar',
      category: 'game',
      description: 'Máximo de partidos a cargar de una sola vez desde la API',
    },
    {
      key: 'cron_sync_interval_minutes',
      label: 'Frecuencia del cron (minutos)',
      category: 'cron',
      description: 'Cada cuántos minutos corre el cron (debe coincidir con cron-job.org)',
    },
    {
      key: 'cron_fixture_sync_interval_hours',
      label: 'Intervalo de sync automático (horas)',
      category: 'cron',
      description: 'Cada cuántas horas el cron sincroniza fixtures nuevos automáticamente',
    },
    {
      key: 'api_football_daily_limit',
      label: 'Límite diario API-Football',
      category: 'api',
      description: 'Límite diario de requests a API-Football',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/pollas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <Link href="/admin/dashboard">
          <Button variant="outline" size="sm" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black">Configuración del sistema</h1>
          <p className="text-sm text-muted-foreground">
            Parámetros operativos editables en tiempo real
          </p>
        </div>
      </div>

      <SettingsForm settings={settings} settingsList={settingsList} />
    </div>
  );
}
