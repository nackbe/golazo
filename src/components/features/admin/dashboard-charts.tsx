'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Users, Target } from 'lucide-react';

interface ChartDataPoint {
  day: string;
  requests?: number;
  usuarios?: number;
  predicciones?: number;
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      </div>
      <div className="h-48">{children}</div>
    </div>
  );
}

export function DashboardCharts({
  apiUsageData,
  usersData,
  predictionsData,
}: {
  apiUsageData: ChartDataPoint[];
  usersData: ChartDataPoint[];
  predictionsData: ChartDataPoint[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="API requests (últimos 7 días)" icon={TrendingUp}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={apiUsageData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: 12,
              }}
            />
            <Bar dataKey="requests" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Usuarios nuevos (últimos 7 días)" icon={Users}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={usersData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="usuarios"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Predicciones (últimos 7 días)" icon={Target}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={predictionsData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: 12,
              }}
            />
            <Bar dataKey="predicciones" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
