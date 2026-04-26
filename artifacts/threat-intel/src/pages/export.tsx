import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, FileJson, Package, Loader2, DownloadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExportHistory } from "@/components/HistoryLog";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

function buildQs(typeFilter: string): string {
  return typeFilter !== "all" ? `?indicator_type=${encodeURIComponent(typeFilter)}` : "";
}

// Trigger a native browser file download by navigating an invisible anchor.
// The server sets Content-Disposition: attachment so the browser saves the file
// directly to disk — no JavaScript memory buffering of large payloads.
function triggerAnchorDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function Export() {
  const { toast } = useToast();

  const [typeFilter, setTypeFilter] = useState("all");
  const [historyKey, setHistoryKey] = useState(0);
  const [airgapPending, setAirgapPending] = useState(false);
  const [airgapMeta, setAirgapMeta] = useState<any>(null);

  const handleCsvExport = () => {
    triggerAnchorDownload(`${BASE_URL}api/export/csv${buildQs(typeFilter)}`);
    toast({ title: "CSV Export Started", description: "Your browser will prompt you to save the file." });
    setTimeout(() => setHistoryKey(k => k + 1), 1500);
  };

  const handleJsonExport = () => {
    triggerAnchorDownload(`${BASE_URL}api/export/json${buildQs(typeFilter)}`);
    toast({ title: "JSON Export Started", description: "Your browser will prompt you to save the file." });
    setTimeout(() => setHistoryKey(k => k + 1), 1500);
  };

  // Step 1: POST to get metadata (lightweight — no raw data in response)
  // Step 2: trigger the package download via a dedicated GET endpoint
  const handleAirgapExport = async () => {
    setAirgapPending(true);
    setAirgapMeta(null);
    try {
      const res = await fetch(`${BASE_URL}api/export/airgap`, { method: "POST" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const meta = await res.json();
      setAirgapMeta(meta);
      // Now trigger the actual file download via the GET streaming endpoint
      triggerAnchorDownload(`${BASE_URL}api/export/airgap/package`);
      toast({ title: "Air-gap Package Generated", description: "Download started." });
      setHistoryKey(k => k + 1);
    } catch (e: any) {
      toast({ title: "Air-gap Export Failed", description: e.message, variant: "destructive" });
    } finally {
      setAirgapPending(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export Center</h1>
        <p className="text-muted-foreground mt-1">Extract threat data for external tools, sharing, or air-gapped transfers.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 flex flex-col sm:flex-row gap-6 items-center justify-between mb-8">
        <div className="space-y-1 flex-1">
          <Label className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Global Export Filter</Label>
          <p className="text-sm text-muted-foreground">Apply this filter to standard CSV and JSON exports.</p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Indicator Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="ip">IP Address</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="url">URL</SelectItem>
              <SelectItem value="hash">Hash</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border bg-card/50 hover:bg-card transition-colors">
          <CardHeader>
            <FileText className="w-8 h-8 text-primary mb-2" />
            <CardTitle>CSV Export</CardTitle>
            <CardDescription>Flat structure, compatible with standard SIEMs and spreadsheets.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Includes all standard indicator fields. Applies current global filter.
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline" onClick={handleCsvExport}>
              <DownloadCloud className="w-4 h-4 mr-2" />
              Download CSV
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border bg-card/50 hover:bg-card transition-colors">
          <CardHeader>
            <FileJson className="w-8 h-8 text-primary mb-2" />
            <CardTitle>JSON Export</CardTitle>
            <CardDescription>Structured format suitable for API integration and scripting.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Preserves metadata and typing. Applies current global filter.
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline" onClick={handleJsonExport}>
              <DownloadCloud className="w-4 h-4 mr-2" />
              Download JSON
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <Package className="w-8 h-8 text-primary mb-2" />
            <CardTitle className="text-primary">Air-gap Package</CardTitle>
            <CardDescription>Comprehensive full-database dump with integrity verification.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-foreground">
            Generates a complete snapshot ignoring filters, includes manifest and checksums.
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleAirgapExport} disabled={airgapPending}>
              {airgapPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
              {airgapPending ? "Generating…" : "Generate Package"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <ExportHistory refreshKey={historyKey} />

      {airgapMeta && (
        <Card className="border-border bg-card mt-8 animate-in fade-in slide-in-from-bottom-4">
          <CardHeader>
            <CardTitle className="text-xl">Package Details</CardTitle>
            <CardDescription>Verify these details on the receiving system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Generated At</Label>
                <div className="font-mono mt-1">{new Date(airgapMeta.manifest.generated_at).toLocaleString()}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Total Indicators</Label>
                <div className="font-mono mt-1 text-primary">{airgapMeta.manifest.total_indicators.toLocaleString()}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">SHA-256 Checksum</Label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all text-primary/80 border border-border">
                {airgapMeta.checksum}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider mb-2 block">Feed Breakdown</Label>
              <div className="bg-muted/50 rounded-md border border-border divide-y divide-border">
                {airgapMeta.manifest.feeds.map((f: any, i: number) => (
                  <div key={i} className="flex justify-between p-3 text-sm">
                    <span className="font-medium">{f.name}</span>
                    <span className="font-mono text-muted-foreground">{f.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerAnchorDownload(`${BASE_URL}api/export/airgap/package`)}
            >
              <DownloadCloud className="w-4 h-4 mr-2" />
              Re-download Package
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
