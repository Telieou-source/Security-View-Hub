import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListFeeds, useCreateFeed, useUpdateFeed, useDeleteFeed, useFetchFeed, useFetchAllFeeds, getListFeedsQueryKey, FeedFeedType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, Plus, Edit2, Trash2, Activity } from "lucide-react";

export default function Feeds() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: feeds, isLoading } = useListFeeds({ query: { queryKey: getListFeedsQueryKey() } });
  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();
  const fetchFeed = useFetchFeed();
  const fetchAllFeeds = useFetchAllFeeds();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<any>(null);
  
  const [formData, setFormData] = useState({ name: "", url: "", feed_type: FeedFeedType.ip_reputation, enabled: true });

  const handleSaveFeed = () => {
    if (editingFeed) {
      updateFeed.mutate({ id: editingFeed.id, data: formData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFeedsQueryKey() });
          setIsAddOpen(false);
          setEditingFeed(null);
          toast({ title: "Feed updated" });
        },
        onError: (err: any) => toast({ title: "Error updating feed", description: err.message, variant: "destructive" })
      });
    } else {
      createFeed.mutate({ data: formData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFeedsQueryKey() });
          setIsAddOpen(false);
          toast({ title: "Feed created" });
        },
        onError: (err: any) => toast({ title: "Error creating feed", description: err.message, variant: "destructive" })
      });
    }
  };

  const handleFetchAll = () => {
    fetchAllFeeds.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListFeedsQueryKey() });
        toast({ title: "Fetch complete", description: `Added: ${data.total_added}, Updated: ${data.total_updated}` });
      },
      onError: (err: any) => toast({ title: "Fetch failed", description: err.message, variant: "destructive" })
    });
  };

  const handleFetchSingle = (id: number) => {
    fetchFeed.mutate({ id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListFeedsQueryKey() });
        toast({ title: "Feed fetched", description: `Added: ${data.indicators_added}, Updated: ${data.indicators_updated}` });
      },
      onError: (err: any) => toast({ title: "Fetch failed", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this feed?")) {
      deleteFeed.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFeedsQueryKey() });
          toast({ title: "Feed deleted" });
        }
      });
    }
  };

  const openEdit = (feed: any) => {
    setEditingFeed(feed);
    setFormData({ name: feed.name, url: feed.url, feed_type: feed.feed_type, enabled: feed.enabled });
    setIsAddOpen(true);
  };

  const openAdd = () => {
    setEditingFeed(null);
    setFormData({ name: "", url: "", feed_type: FeedFeedType.ip_reputation, enabled: true });
    setIsAddOpen(true);
  };

  const typeColors: Record<string, string> = {
    ip_reputation: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    malware: "bg-red-500/20 text-red-400 border-red-500/30",
    botnet_c2: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    ssl_abuse: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    brute_force: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    other: "bg-gray-500/20 text-gray-400 border-gray-500/30"
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feed Management</h1>
          <p className="text-muted-foreground mt-1">Configure and manage threat intelligence sources.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleFetchAll} disabled={fetchAllFeeds.isPending}>
            {fetchAllFeeds.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Fetch All
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Feed
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="text-right">Indicators</TableHead>
              <TableHead>Last Fetched</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : feeds?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No feeds configured.
                </TableCell>
              </TableRow>
            ) : (
              feeds?.map((feed) => (
                <TableRow key={feed.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${feed.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{feed.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${typeColors[feed.feed_type] || typeColors.other}`}>
                      {feed.feed_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={feed.url}>
                    {feed.url}
                  </TableCell>
                  <TableCell className="text-right font-mono">{feed.indicator_count.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {feed.last_fetched ? new Date(feed.last_fetched).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleFetchSingle(feed.id)} disabled={fetchFeed.isPending || !feed.enabled} title="Fetch Now">
                        <RefreshCw className="w-4 h-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(feed)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(feed.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingFeed ? 'Edit Feed' : 'Add Feed'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Emerging Threats" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url">URL (CSV format)</Label>
              <Input id="url" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Feed Type</Label>
              <Select value={formData.feed_type} onValueChange={(v: FeedFeedType) => setFormData({ ...formData, feed_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(FeedFeedType).map(t => (
                    <SelectItem key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Switch id="enabled" checked={formData.enabled} onCheckedChange={(v) => setFormData({ ...formData, enabled: v })} />
              <Label htmlFor="enabled">Feed Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFeed} disabled={createFeed.isPending || updateFeed.isPending}>
              {createFeed.isPending || updateFeed.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Feed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
