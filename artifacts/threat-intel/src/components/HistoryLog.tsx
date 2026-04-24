import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

/* ── Import History ─────────────────────────────────────────── */

interface ImportRow {
  id: number;
  source_name: string;
  source_url: string | null;
  feed_type: string;
  indicators_added: number;
  indicators_updated: number;
  indicators_skipped: number;
  error_count: number;
  created_at: string;
}

interface ImportHistoryProps {
  /** If provided, warn when this URL was imported in the last 24 h */
  watchUrl?: string;
  onDuplicateWarning?: (isDuplicate: boolean) => void;
  refreshKey?: number;
}

export function ImportHistory({ watchUrl, onDuplicateWarning, refreshKey }: ImportHistoryProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);

  useEffect(() => {
    fetch(`${BASE_URL}api/history/imports`)
      .then(r => r.json())
      .then((data: ImportRow[]) => {
        setRows(data);
        if (watchUrl && onDuplicateWarning) {
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          const isDuplicate = data.some(
            r => r.source_url === watchUrl && new Date(r.created_at).getTime() > cutoff
          );
          onDuplicateWarning(isDuplicate);
        }
      })
      .catch(() => {});
  }, [watchUrl, refreshKey]);

  if (rows.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowDownToLine className="w-4 h-4 text-primary" />
          Recent Import History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {rows.map(row => (
            <div key={row.id} className="flex items-start gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
              <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate max-w-[220px]" title={row.source_name}>
                    {row.source_name}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {row.feed_type.replace(/_/g, " ")}
                  </Badge>
                  {row.error_count > 0 && (
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {row.error_count} errors
                    </Badge>
                  )}
                </div>
                {row.source_url && (
                  <div className="text-xs text-muted-foreground font-mono truncate max-w-xs mt-0.5" title={row.source_url}>
                    {row.source_url}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="text-primary font-mono">+{formatNum(row.indicators_added)}</span>
                {row.indicators_updated > 0 && (
                  <span className="font-mono text-yellow-500">~{formatNum(row.indicators_updated)}</span>
                )}
                <span className="text-muted-foreground">{relativeTime(row.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Duplicate Warning Banner ───────────────────────────────── */

export function DuplicateWarning({ url }: { url: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        <strong>Possible duplicate:</strong> <span className="font-mono break-all">{url}</span> was already imported within the last 24 hours. You can still proceed.
      </span>
    </div>
  );
}

/* ── Export History ─────────────────────────────────────────── */

interface ExportRow {
  id: number;
  format: string;
  indicator_count: number;
  filters: Record<string, string> | null;
  created_at: string;
}

const FORMAT_LABELS: Record<string, string> = {
  csv: "CSV",
  json: "JSON",
  airgap: "Air-gap",
};

interface ExportHistoryProps {
  refreshKey?: number;
}

export function ExportHistory({ refreshKey }: ExportHistoryProps) {
  const [rows, setRows] = useState<ExportRow[]>([]);

  useEffect(() => {
    fetch(`${BASE_URL}api/history/exports`)
      .then(r => r.json())
      .then((data: ExportRow[]) => setRows(data))
      .catch(() => {});
  }, [refreshKey]);

  if (rows.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpFromLine className="w-4 h-4 text-primary" />
          Recent Export History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {rows.map(row => {
            const activeFilters = row.filters
              ? Object.entries(row.filters).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`)
              : [];
            return (
              <div key={row.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="text-xs">{FORMAT_LABELS[row.format] ?? row.format.toUpperCase()}</Badge>
                    {activeFilters.length > 0 && (
                      <span className="text-xs text-muted-foreground font-mono">{activeFilters.join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span className="font-mono">{formatNum(row.indicator_count)} indicators</span>
                  <span>{relativeTime(row.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
