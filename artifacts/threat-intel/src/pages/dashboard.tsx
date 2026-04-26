import { useGetStats, useGetStatsByType, useGetStatsByCountry, useGetStatsByFeed, getGetStatsQueryKey, getGetStatsByTypeQueryKey, getGetStatsByCountryQueryKey, getGetStatsByFeedQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Activity, Globe, Database, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import WorldThreatMap from "@/components/WorldThreatMap";
import { useLocation } from "wouter";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  if (!code || code === "XX") return "Unknown";
  try { return regionNames.of(code) ?? code; } catch { return code; }
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const { data: byType, isLoading: typeLoading } = useGetStatsByType({ query: { queryKey: getGetStatsByTypeQueryKey() } });
  const { data: byCountry, isLoading: countryLoading } = useGetStatsByCountry({ query: { queryKey: getGetStatsByCountryQueryKey() } });
  const { data: byFeed, isLoading: feedLoading } = useGetStatsByFeed({ query: { queryKey: getGetStatsByFeedQueryKey() } });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const CHART_COLORS = ['#00e5ff', '#00b3ff', '#0080ff', '#8000ff', '#ff00aa'];

  const countryChartData = (byCountry || []).slice(0, 10).map(r => ({
    count: r.count,
    label: countryName(r.label),
    code: r.label,
  }));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Dashboard</h1>
        <p className="text-muted-foreground mt-1">Real-time overview of collected threat indicators.</p>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Indicators</CardTitle>
            <Shield className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">{stats?.total_indicators.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-primary font-medium">+{stats?.indicators_added_today.toLocaleString() || 0}</span> today
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Import Sources</CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">{stats?.import_sources ?? stats?.active_feeds ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Distinct threat sources</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Unique Countries</CardTitle>
            <Globe className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">{stats?.unique_countries || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Geographic distribution</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Last Update</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-mono font-bold text-foreground">
              {stats?.last_update ? new Date(stats.last_update).toLocaleTimeString() : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.last_update ? new Date(stats.last_update).toLocaleDateString() : 'No updates'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* World Threat Map — full width */}
      <Card className="bg-card/50 backdrop-blur border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Global Threat Distribution
            {countryLoading && <Loader2 className="w-3 h-3 animate-spin ml-1 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[380px] p-2 pt-0">
          <WorldThreatMap data={byCountry ?? []} />
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Indicators by Type */}
        <Card className="bg-card/50 backdrop-blur border-border col-span-2 lg:col-span-1 group">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Indicators by Type
              <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {typeLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="label" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(data: any) => navigate(`/indicators?type=${encodeURIComponent(data.label)}`)}
                  >
                    {(byType || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Feed Sources */}
        <Card className="bg-card/50 backdrop-blur border-border col-span-2 lg:col-span-1 group">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Top Feed Sources
              <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {feedLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFeed || []} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis type="number" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="label" type="category" stroke="#666" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    fill="hsl(var(--primary))"
                    style={{ cursor: 'pointer' }}
                    onClick={(data: any) => navigate(`/indicators?source=${encodeURIComponent(data.label)}`)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Countries */}
        <Card className="bg-card/50 backdrop-blur border-border col-span-2 lg:col-span-1 group">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Top Countries
              <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {countryLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={countryChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis type="number" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="label" type="category" stroke="#666" fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    fill="hsl(var(--chart-4))"
                    style={{ cursor: 'pointer' }}
                    onClick={(data: any) => navigate(`/indicators?country=${encodeURIComponent(data.code)}`)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
