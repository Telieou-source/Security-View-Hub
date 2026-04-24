import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, AlertCircle, RefreshCw, Upload, Package } from "lucide-react";

export default function Docs() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">Platform usage and operational procedures.</p>
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Managing Feeds
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground">
            <p>
              The platform ingests threat intelligence via flat CSV files available over HTTP/HTTPS. 
              To add a new feed, navigate to the <strong>Feeds</strong> page and click <strong>Add Feed</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Name:</strong> A descriptive identifier for the feed.</li>
              <li><strong>URL:</strong> The direct link to the CSV file.</li>
              <li><strong>Type:</strong> Categorizes the indicators (e.g., Malware, IP Reputation).</li>
            </ul>
            <div className="bg-muted p-4 rounded-md mt-4 border border-border text-sm">
              <strong>Schema Requirement:</strong> The remote CSV must contain an <code>indicator</code> column. 
              Optional columns include: <code>indicator_type</code>, <code>confidence</code>, <code>country</code>, and <code>description</code>.
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Offline Import
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground">
            <p>
              When working with localized or air-gapped networks, you may receive intelligence in raw text format.
              Use the <strong>Import</strong> tab to ingest this data.
            </p>
            <p>
              Paste the raw CSV data directly into the text area. The system will parse it using the same schema rules as automated feeds. The feed name provided will be used as the <code>source_feed</code> for all parsed indicators.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Air-gap Export
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground">
            <p>
              The Air-gap export generates a comprehensive snapshot of the entire indicator database, structured specifically for ingestion into disconnected environments.
            </p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Navigate to the <strong>Export</strong> page.</li>
              <li>Select <strong>Generate Package</strong> under the Air-gap section.</li>
              <li>The system will bundle the data into a structured JSON payload and calculate a SHA-256 checksum.</li>
              <li>Record the checksum displayed on the screen. Verify this checksum on the receiving system before ingestion to ensure data integrity.</li>
            </ol>
            <div className="bg-primary/10 p-4 rounded-md mt-4 border border-primary/20 flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                Air-gap packages bypass all current UI filters to ensure a complete database transfer. If you need filtered data, use the standard JSON or CSV export options.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
