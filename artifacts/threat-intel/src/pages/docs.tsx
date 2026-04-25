import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, AlertCircle, Upload, Package, Globe, ExternalLink, FileText } from "lucide-react";

export default function Docs() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">Platform usage and operational procedures.</p>
      </div>

      <div className="space-y-8">

        {/* ── Threat Feed Sources ───────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Finding Threat Feeds
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground space-y-3">
            <p>
              This platform is designed for <strong>manual import</strong> — you download threat feed files
              on an internet-connected machine, then import them here (including into fully air-gapped environments).
            </p>
            <p>
              The recommended source for open-source threat feeds is:
            </p>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-4">
                <Globe className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://threatfeeds.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-semibold text-lg hover:underline flex items-center gap-1"
                    >
                      threatfeeds.io
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A curated directory of free, open-source threat intelligence feeds — IP reputation lists,
                    malware domains, C2 blocklists, and more. Each feed provides a direct download URL compatible
                    with this platform's importer.
                  </p>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm">
              Once you have a feed URL, paste it into the <strong>Import → Import from URL</strong> field and
              the server will fetch and ingest it automatically. For air-gapped environments, download the raw
              file first and paste its contents using <strong>Import → Paste CSV</strong>.
            </p>
          </div>
        </section>

        {/* ── Offline / Air-gap Import ──────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Importing Data
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground space-y-3">
            <p>
              Navigate to the <strong>Import</strong> page. Two modes are available:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Import from URL</strong> — provide a direct link to a CSV or plain-text IP list.
                The server fetches the file server-side; no size limits apply. Ideal when the platform
                has internet access or intranet reachability to the feed host.
              </li>
              <li>
                <strong>Paste CSV</strong> — copy the raw file contents and paste them directly. This is
                the primary method for <strong>air-gapped deployments</strong> where the server has no
                outbound internet access.
              </li>
            </ul>
            <div className="bg-muted p-4 rounded-md border border-border text-sm">
              <strong>CSV Schema:</strong> The file must contain an <code>indicator</code> column. Optional
              columns: <code>indicator_type</code>, <code>confidence</code>, <code>country</code>,
              <code>description</code>. Plain-text files with one IP per line are also accepted — each
              line is treated as an <code>ip</code> indicator. Country enrichment is applied automatically
              using a local offline database (no internet required).
            </div>
            <p className="text-sm">
              Each import is logged in the <strong>Recent Import History</strong> section of the Import page.
              You can delete any import — this removes the history record <em>and</em> all indicators that
              came from it.
            </p>
          </div>
        </section>

        {/* ── Air-gap Export ────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Air-gap Export
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground space-y-3">
            <p>
              The Air-gap export bundles the entire indicator database into a single structured JSON
              package, checksummed for transport integrity.
            </p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Navigate to the <strong>Export</strong> page.</li>
              <li>Click <strong>Generate Package</strong> under the Air-gap section.</li>
              <li>The system bundles data into a structured JSON payload and computes a SHA-256 checksum.</li>
              <li>
                Record the checksum shown on screen. <strong>Verify it on the receiving system</strong> before
                ingesting to confirm the file was not corrupted or tampered with in transit.
              </li>
            </ol>
            <div className="bg-primary/10 p-4 rounded-md border border-primary/20 flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                Air-gap packages bypass all UI filters to ensure a complete database transfer. For filtered
                exports use the standard CSV or JSON options instead.
              </p>
            </div>
          </div>
        </section>

        {/* ── CSV Schema Reference ──────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b border-border pb-2 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            CSV Schema Reference
          </h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Column</th>
                  <th className="text-left px-4 py-2 font-medium">Required</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["indicator", "Yes", "The threat indicator value (IP, domain, hash, URL, etc.)"],
                  ["indicator_type", "No", "Type hint: ip, domain, url, hash, email. Auto-detected if omitted."],
                  ["confidence", "No", "Integer 0–100. Defaults to 75 if omitted."],
                  ["country", "No", "ISO country code. Auto-enriched from IP via local GeoIP database."],
                  ["description", "No", "Free-text description or threat context."],
                ].map(([col, req, desc]) => (
                  <tr key={col} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-primary">{col}</td>
                    <td className="px-4 py-2 text-muted-foreground">{req}</td>
                    <td className="px-4 py-2 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
