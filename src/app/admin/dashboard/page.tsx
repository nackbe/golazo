import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardStats } from '@/components/features/admin/dashboard-stats';
import { DashboardCharts } from '@/components/features/admin/dashboard-charts';
import { RecentActivity } from '@/components/features/admin/recent-activity';

export const dynamic = 'force-dynamic';

function groupByDay(rows: { created_at: string }[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const day = row.created_at.split('T')[0];
    map.set(day, (map.get(day) || 0) + 1);
  }
  // Fill missing days in last 7 days
  const result: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    result.push({ day: dayStr, count: map.get(dayStr) || 0 });
  }
  return result;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_system_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_system_admin) redirect('/pollas');

  const admin = createAdminClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  const todayIso = new Date().toISOString().split('T')[0];

  // Parallel stats queries
  const [
    { count: totalUsers },
    { count: usersToday },
    { data: pollasByStatus },
    { count: totalPredictions },
    { count: predictionsToday },
    { data: matchesByStatus },
    { count: apiUsageToday },
    { data: apiUsage7Days },
    { data: users7Days },
    { data: predictions7Days },
    { data: recentActivity },
    { data: apiLimitSetting },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
    admin.from('pollas').select('status'),
    admin.from('predictions').select('*', { count: 'exact', head: true }),
    admin.from('predictions').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
    admin.from('matches').select('status'),
    admin.from('api_usage_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
    admin.from('api_usage_logs').select('created_at').gte('created_at', sevenDaysAgoIso),
    admin.from('profiles').select('created_at').gte('created_at', sevenDaysAgoIso),
    admin.from('predictions').select('created_at').gte('created_at', sevenDaysAgoIso),
    admin.from('api_usage_logs').select('action, identifier, metadata, created_at').order('created_at', { ascending: false }).limit(20),
    admin.from('system_settings').select('value').eq('key', 'api_football_daily_limit').single(),
  ]);

  const pollasBreakdown = {
    draft: pollasByStatus?.filter((p) => p.status === 'draft').length || 0,
    open: pollasByStatus?.filter((p) => p.status === 'open').length || 0,
    active: pollasByStatus?.filter((p) => p.status === 'active').length || 0,
    finished: pollasByStatus?.filter((p) => p.status === 'finished').length || 0,
    total: pollasByStatus?.length || 0,
  };

  const matchesBreakdown = {
    ns: matchesByStatus?.filter((m) => m.status === 'NS').length || 0,
    live: matchesByStatus?.filter((m) => !!m.status && ['1H', 'HT', '2H', 'ET', 'PEN', 'LIVE'].includes(m.status)).length || 0,
    ft: matchesByStatus?.filter((m) => !!m.status && ['FT', 'AET', 'AFT'].includes(m.status)).length || 0,
    other: matchesByStatus?.filter((m) => !m.status || !['NS', '1H', 'HT', '2H', 'ET', 'PEN', 'LIVE', 'FT', 'AET', 'AFT'].includes(m.status)).length || 0,
    total: matchesByStatus?.length || 0,
  };

  const apiLimit = (apiLimitSetting?.value as any)?.value || 7500;

  const apiUsageChartData = groupByDay(apiUsage7Days || []).map((d) => ({
    day: new Date(d.day + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
    requests: d.count,
  }));

  const usersChartData = groupByDay(users7Days || []).map((d) => ({
    day: new Date(d.day + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
    usuarios: d.count,
  }));

  const predictionsChartData = groupByDay(predictions7Days || []).map((d) => ({
    day: new Date(d.day + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
    predicciones: d.count,
  }));

  const stats = {
    totalUsers: totalUsers || 0,
    usersToday: usersToday || 0,
    pollas: pollasBreakdown,
    totalPredictions: totalPredictions || 0,
    predictionsToday: predictionsToday || 0,
    matches: matchesBreakdown,
    apiToday: apiUsageToday || 0,
    apiLimit,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/pollas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <Link href="/admin/settings">
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <LayoutDashboard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Estadísticas y métricas del sistema
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <DashboardStats stats={stats} />

      {/* Charts */}
      <DashboardCharts
        apiUsageData={apiUsageChartData}
        usersData={usersChartData}
        predictionsData={predictionsChartData}
      />

      {/* Recent Activity */}
      <RecentActivity activity={recentActivity || []} />
    </div>
  );
}
