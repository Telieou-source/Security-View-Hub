import { useState } from "react";
import { useListIndicators, getListIndicatorsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, FilterX, ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { COUNTRIES } from "@/lib/countries";

export default function Indicators() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");

  const queryClient = useQueryClient();

  const params = {
    page,
    limit: 50,
    search: debouncedSearch || undefined,
    indicator_type: typeFilter !== "all" ? typeFilter : undefined,
    country: countryFilter !== "all" ? countryFilter : undefined,
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
    setPage(1);
  };

  return (
    <div className="p-8 flex flex-col h-full space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Indicators Database</h1>
        <p className="text-muted-foreground mt-1">Search, filter, and explore all ingested threat indicators.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search indicators, descriptions..." 
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
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !data || data.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No indicators found matching filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.data.map((ind) => (
                  <TableRow key={ind.id}>
                    <TableCell className="font-mono text-sm font-medium">{ind.indicator}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">{ind.indicator_type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{ind.source_feed}</TableCell>
                    <TableCell>
                      {ind.country ? (
                        <span className="font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">{ind.country}</span>
                      ) : <span className="text-muted-foreground/50">-</span>}
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
  );
}
