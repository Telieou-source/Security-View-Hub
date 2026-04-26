import { useState } from "react";
import { useListIndicators, getListIndicatorsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Search, FilterX, ChevronLeft, ChevronRight, Link2, ExternalLink, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { COUNTRIES } from "@/lib/countries";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

type Indicator = {
  id: number;
  indicator: string;
  indicator_type: string;
  source_feed: string;
  country?: string | null;
  description?: string | null;
  first_seen?: string | null;
  created_at?: string | null;
  correlation_id?: string | null;
};

function fmtDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ip: "border-blue-500/40 text-blue-400",
    url: "border-orange-500/40 text-orange-400",
    domain: "border-green-500/40 text-green-400",
    md5: "border-purple-500/40 text-purple-400",
    sha1: "border-purple-500/40 text-purple-400",
    sha256: "border-purple-500/40 text-purple-400",
    hash: "border-purple-500/40 text-purple-400",
  };
  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${colors[type] ?? ""}`}>
      {type}
    </Badge>
  );
}

function CorrelationPanel({ indicator, onClose }: { indicator: Indicator; onClose: () => void }) {
  const [related, setRelated] = useState<Indicator[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRelated = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}api/indicators/${id}/related`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRelated(json.related ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load related indicators");
    } finally {
      setLoading(false);
    }
  };

  // Load related on first render
  useState(() => { loadRelated(indicator.id); });

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Type", value: indicator.indicator_type },
    { label: "Source", value: indicator.source_feed },
    { label: "Country", value: indicator.country },
    { label: "Description", value: indicator.description },
    { label: "First Seen", value: indicator.first_seen },
    { label: "First Imported", value: fmtDate(indicator.created_at) },
  ];

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Selected indicator */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <p className="font-mono text-sm font-semibold break-all text-foreground">{indicator.indicator}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map(({ label, value }) =>
            value ? (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
                <p className="text-sm font-mono break-all">{value}</p>
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* Related indicators */}
      <div className="flex-1 overflow-auto space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {loading ? "Loading correlations…" : error ? "Error loading correlations" : related?.length === 0 ? "No correlated indicators" : `${related?.length} correlated indicator${related?.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive px-1">{error}</p>
        )}

        {related && related.length > 0 && (
          <div className="space-y-2">
            {related.map((rel) => (
              <div key={rel.id} className="rounded-md border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs font-medium break-all text-foreground flex-1">{rel.indicator}</p>
                  <TypeBadge type={rel.indicator_type} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {rel.country && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{rel.country}</span>
                  )}
                  {rel.description && (
                    <span className="text-[11px] text-muted-foreground truncate">{rel.description}</span>
                  )}
                  {rel.first_seen && (
                    <span className="text-[11px] text-muted-foreground">First seen: {rel.first_seen}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {related && related.length === 0 && !indicator.correlation_id && (
          <p className="text-xs text-muted-foreground px-1">
            This indicator was imported alone — no row-level correlations exist for it. Re-import the source feed to enable correlation if it contains multi-column data.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Indicators() {
  // Initialise filters from URL search params (set by dashboard chart clicks)
  const qs = () => new URLSearchParams(window.location.search);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState(() => qs().get("type") || "all");
  const [countryFilter, setCountryFilter] = useState(() => qs().get("country") || "all");
  const [sourceFilter, setSourceFilter] = useState(() => qs().get("source") || "");
  const [selected, setSelected] = useState<Indicator | null>(null);

  const queryClient = useQueryClient();

  const params = {
    page,
    limit: 50,
    search: debouncedSearch || undefined,
    indicator_type: typeFilter !== "all" ? typeFilter : undefined,
    country: countryFilter !== "all" ? countryFilter : undefined,
    source_feed: sourceFilter || undefined,
  };

  const { data, isLoading, isFetching } = useListIndicators(params, {
    query: { queryKey: getListIndicatorsQueryKey(params), keepPreviousData: true }
  });

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setDebouncedSearch(search);
      setPage(1);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setTypeFilter("all");
    setCountryFilter("all");
    setSourceFilter("");
    setPage(1);
  };

  return (
    <>
      <div className="p-8 flex flex-col h-full space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Indicators Database</h1>
          <p className="text-muted-foreground mt-1">Search, filter, and explore all ingested threat indicators. Click any row to see correlations.</p>
        </div>

        {sourceFilter && (
          <div className="flex items-center gap-2 text-sm bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
            <span className="text-muted-foreground">Source:</span>
            <span className="font-mono text-primary font-medium">{sourceFilter}</span>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setSourceFilter(""); setPage(1); }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by indicator or source…"
              className="pl-9 font-mono"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="ip">IP Address</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="url">URL</SelectItem>
              <SelectItem value="hash">Hash</SelectItem>
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={v => { setCountryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto">
              <SelectItem value="all">All Countries</SelectItem>
              {COUNTRIES.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={resetFilters} title="Reset Filters">
            <FilterX className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 rounded-md border border-border bg-card flex flex-col overflow-hidden relative">
          {isFetching && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 overflow-hidden">
              <div className="h-full bg-primary w-1/3 animate-[pulse_1s_ease-in-out_infinite]" />
            </div>
          )}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Indicator</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead>First Imported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : !data || data.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No indicators found matching filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.data.map((ind) => (
                    <TableRow
                      key={ind.id}
                      className={`cursor-pointer transition-colors ${selected?.id === ind.id ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/50"}`}
                      onClick={() => setSelected(ind as Indicator)}
                    >
                      <TableCell className="font-mono text-sm font-medium max-w-[220px] truncate" title={ind.indicator}>
                        <span className="flex items-center gap-1.5">
                          {ind.correlation_id && <Link2 className="w-3 h-3 shrink-0 text-primary/60" />}
                          {ind.indicator}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={ind.indicator_type} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{ind.source_feed}</TableCell>
                      <TableCell>
                        {ind.country ? (
                          <span className="font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">{ind.country}</span>
                        ) : <span className="text-muted-foreground/50">-</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={(ind as any).description ?? undefined}>
                        {(ind as any).description ?? <span className="text-muted-foreground/30">-</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {(ind as any).first_seen ?? <span className="text-muted-foreground/30">-</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {ind.created_at
                          ? new Date(ind.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data && (
            <div className="border-t border-border p-4 flex items-center justify-between bg-muted/20">
              <div className="text-sm text-muted-foreground font-mono">
                Showing {(page - 1) * params.limit + 1} to {Math.min(page * params.limit, data.total)} of {data.total}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center px-4 font-mono text-sm font-medium">
                  Page {page} of {data.total_pages || 1}
                </div>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.total_pages || 1, p + 1))} disabled={page >= (data.total_pages || 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Correlation detail sheet */}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto flex flex-col">
          <SheetHeader className="mb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Link2 className="w-4 h-4 text-primary" />
              Indicator Correlation
            </SheetTitle>
          </SheetHeader>
          {selected && (
            <CorrelationPanel
              key={selected.id}
              indicator={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
