import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDocumentStore } from '@/stores/document-store'

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function IndexedDocumentsSection() {
  const documents = useDocumentStore((s) => s.documents)
  const loaded = useDocumentStore((s) => s.loaded)
  const loading = useDocumentStore((s) => s.loading)
  const loadDocuments = useDocumentStore((s) => s.loadDocuments)
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)

  useEffect(() => {
    if (!loaded) loadDocuments().catch((err) => {
      console.error('[documents] load failed:', err)
    })
  }, [loaded, loadDocuments])

  const handleDelete = async (id: string, path: string) => {
    try {
      await deleteDocument(id)
      toast.success(`Removed ${basename(path)} from index`)
    } catch {
      toast.error('Failed to delete document')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Indexed Documents</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => loadDocuments()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Documents the agent has embedded for semantic search. Re-indexing the same
        file is a no-op while its contents stay unchanged.
      </p>

      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {loaded ? 'No documents indexed yet.' : 'Loading…'}
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" title={doc.path}>
                    {basename(doc.path)}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {doc.chunkCount} {doc.chunkCount === 1 ? 'chunk' : 'chunks'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate font-mono mt-0.5" title={doc.path}>
                  {doc.path}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Indexed {formatRelative(doc.indexedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(doc.id, doc.path)}
                title="Remove from index"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
