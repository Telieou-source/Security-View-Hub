import { useState, useEffect } from "react";
import { useImportIndicators, ImportIndicatorsBodyFeedType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle, Link2, FileText, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImportHistory, DuplicateWarning } from "@/components/HistoryLog";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

async function importFromUrl(payload: { url: string; feed_name: string; feed_type: string }) {
  const res = await fetch(`${BASE_URL}api/indicators/import-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Server error ${res.status}`);
  }
  return res.json();
}

const FEED_TYPES = Object.values(ImportIndicatorsBodyFeedType);
type Mode = "paste" | "url";

export default function Import() {
  const { toast } = useToast();
  const importMutation = useImportIndicators();

  const [mode, setMode] = useState<Mode>("url");
  const [feedName, setFeedName] = useState("");
  const [feedType, setFeedType] = useState<ImportIndicatorsBodyFeedType>(ImportIndicatorsBodyFeedType.ip_reputation);
  const [csvContent, setCsvContent] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [urlPending, setUrlPending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const watchUrl = mode === "url" ? remoteUrl : undefined;

  const handlePurge = async () => {
    setPurging(true);
    try {
      const res = await fetch(`${BASE_URL}api/indicators/purge`, { method: "DELETE" });
      const data = await res.json();
      toast({ title: "All data cleared", description: `${(data.deleted_indicators ?? 0).toLocaleString()} indicators removed.` });
      setResult(null);
      setHistoryKey(k => k + 1);
    } catch {
      toast({ title: "Purge failed", variant: "destructive" });
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  };

  const handlePasteImport = () => {
    if (!feedName || !csvContent) {
      toast({ title: "Validation Error", description: "Feed name and CSV content are required.", variant: "destructive" });
      return;
    }
    importMutation.mutate({ data: { feed_name: feedName, feed_type: feedType, csv_content: csvContent } }, {
      onSuccess: (data) => {
        setResult(data);
        setHistoryKey(k => k + 1);
        if (data.success) {
          toast({ title: "Import Successful" });
          setCsvContent("");
        } else {
          toast({ title: "Import Completed with Errors", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "Import Failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleUrlImport = async () => {
    if (!feedName || !remoteUrl) {
      toast({ title: "Validation Error", description: "Feed name and URL are required.", variant: "destructive" });
      return;
    }
    setUrlPending(true);
    setResult(null);
    try {
      const data = await importFromUrl({ url: remoteUrl, feed_name: feedName, feed_type: feedType });
      setResult(data);
      setHistoryKey(k => k + 1);
      setIsDuplicate(false);
      if (data.success) {
        toast({ title: "Import Successful" });
        setRemoteUrl("");
        setFeedName("");
      } else {
        toast({ title: "Import Completed with Errors", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setUrlPending(false);
    }
  };

  const isPending = importMutation.isPending || urlPending;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Offline Import</h1>
        <p className="text-muted-foreground mt-1">Ingest threat data from a remote URL or by pasting raw CSV content.</p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={mode === "url" ? "default" : "outline"}
          size="sm"
          onClick={() => { setMode("url"); setResult(null); setIsDuplicate(false); }}
          className="flex items-center gap-2"
        >
          <Link2 className="w-4 h-4" />
          Import from URL
        </Button>
        <Button
          variant={mode === "paste" ? "default" : "outline"}
          size="sm"
          onClick={() => { setMode("paste"); setResult(null); setIsDuplicate(false); }}
          className="flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Paste CSV
        </Button>
      </div>

      {isDuplicate && mode === "url" && remoteUrl && (
        <DuplicateWarning url={remoteUrl} />
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{mode === "url" ? "Import from URL" : "Paste CSV Content"}</CardTitle>
          <CardDescription>
            {mode === "url"
              ? "The server fetches the file directly — no size limits, no paste required."
              : "Paste raw CSV or plain-text data. Supports comma/tab-delimited and headerless IP lists."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="feedName">Source Name</Label>
              <Input
                id="feedName"
                placeholder="e.g. Blocklist.de All Threats"
                value={feedName}
                onChange={e => setFeedName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedType">Feed Category</Label>
              <Select value={feedType} onValueChange={(v: ImportIndicatorsBodyFeedType) => setFeedType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {FEED_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="remoteUrl">Feed URL</Label>
              <Input
                id="remoteUrl"
                placeholder="https://lists.blocklist.de/lists/all.txt"
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Large files and plain-text IP lists are fully supported. The server fetches the URL — nothing is uploaded.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="csvContent">CSV Content</Label>
              <Textarea
                id="csvContent"
                placeholder={"indicator,confidence,country\n192.168.1.1,90,US\nbad-domain.com,100,RU"}
                className="font-mono text-sm h-64 bg-muted/30"
                value={csvContent}
                onChange={e => setCsvContent(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={mode === "url" ? handleUrlImport : handlePasteImport}
              disabled={isPending || (mode === "paste" ? !csvContent || !feedName : !remoteUrl || !feedName)}
            >
              {isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <UploadCloud className="w-4 h-4 mr-2" />}
              {mode === "url" ? "Fetch & Import" : "Process Import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={`border ${result.success ? "border-primary/50" : "border-destructive/50"} bg-card`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {result.success
                ? <CheckCircle2 className="w-5 h-5 text-primary" />
                : <AlertTriangle className="w-5 h-5 text-destructive" />}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Added</div>
                <div className="text-2xl font-mono text-foreground">{result.indicators_added?.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Updated</div>
                <div className="text-2xl font-mono text-foreground">{result.indicators_updated?.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Skipped</div>
                <div className="text-2xl font-mono text-foreground">{(result.indicators_skipped ?? 0).toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Errors</div>
                <div className="text-2xl font-mono text-destructive">{result.errors?.length || 0}</div>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 mt-4">
                <h4 className="text-sm font-semibold text-destructive mb-2">Error Log</h4>
                <ul className="text-sm font-mono text-destructive/80 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err: string, i: number) => (
                    <li key={i}>- {err}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ImportHistory
        watchUrl={watchUrl}
        onDuplicateWarning={setIsDuplicate}
        refreshKey={historyKey}
        onDeleted={() => setHistoryKey(k => k + 1)}
      />

      {/* ── Danger Zone ──────────────────────────────── */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete all indicators and import history. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confirmPurge ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-destructive font-medium">
                This will delete ALL indicators and clear all import history. Are you sure?
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={purging}
                onClick={handlePurge}
              >
                {purging ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Clearing…</> : "Yes, wipe everything"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={purging}
                onClick={() => setConfirmPurge(false)}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setConfirmPurge(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Zero Out All Threat Data
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
