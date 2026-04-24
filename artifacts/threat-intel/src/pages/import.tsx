import { useState } from "react";
import { useImportIndicators, ImportIndicatorsBodyFeedType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Import() {
  const { toast } = useToast();
  const importMutation = useImportIndicators();
  
  const [feedName, setFeedName] = useState("");
  const [feedType, setFeedType] = useState<ImportIndicatorsBodyFeedType>(ImportIndicatorsBodyFeedType.ip_reputation);
  const [csvContent, setCsvContent] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleImport = () => {
    if (!feedName || !csvContent) {
      toast({ title: "Validation Error", description: "Feed name and CSV content are required.", variant: "destructive" });
      return;
    }

    importMutation.mutate({ data: { feed_name: feedName, feed_type: feedType, csv_content: csvContent } }, {
      onSuccess: (data) => {
        setResult(data);
        if (data.success) {
          toast({ title: "Import Successful" });
          setCsvContent(""); // clear on success
        } else {
          toast({ title: "Import Completed with Errors", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "Import Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Offline Import</h1>
        <p className="text-muted-foreground mt-1">Manually ingest CSV data from air-gapped or manual sources.</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Import Details</CardTitle>
          <CardDescription>Paste raw CSV data. Must include 'indicator' column.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="feedName">Source Name</Label>
              <Input id="feedName" placeholder="e.g. Manual Incident Report 04" value={feedName} onChange={e => setFeedName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedType">Feed Category</Label>
              <Select value={feedType} onValueChange={(v: ImportIndicatorsBodyFeedType) => setFeedType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ImportIndicatorsBodyFeedType).map(t => (
                    <SelectItem key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csvContent">CSV Content</Label>
            <Textarea 
              id="csvContent" 
              placeholder="indicator,confidence,country&#10;192.168.1.1,90,US&#10;bad-domain.com,100,RU" 
              className="font-mono text-sm h-64 bg-muted/30"
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={importMutation.isPending || !csvContent || !feedName}>
              {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
              Process Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={`border ${result.success ? 'border-primary/50' : 'border-destructive/50'} bg-card`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {result.success ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <AlertTriangle className="w-5 h-5 text-destructive" />}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Added</div>
                <div className="text-2xl font-mono text-foreground">{result.indicators_added}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Updated</div>
                <div className="text-2xl font-mono text-foreground">{result.indicators_updated}</div>
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
    </div>
  );
}
