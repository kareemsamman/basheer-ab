import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileUploader } from '@/components/media/FileUploader';
import { FilePreviewGallery } from '@/components/policies/FilePreviewGallery';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { FileText, FileImage, FileVideo, Download, Search, Eye, Loader2, Plus, ExternalLink, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

interface MediaFile {
  id: string;
  original_name: string;
  cdn_url: string;
  mime_type: string;
  size: number;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  storage_path?: string | null;
}

interface PolicyInfo {
  id: string;
  policy_number: string | null;
  policy_type_child: string | null;
}

interface ClientFilesTabProps {
  clientId: string;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType?.startsWith('image/')) return FileImage;
  if (mimeType?.startsWith('video/')) return FileVideo;
  return FileText;
};

const isPreviewable = (mimeType: string) =>
  mimeType?.startsWith('image/') || mimeType === 'application/pdf';

export function ClientFilesTab({ clientId }: ClientFilesTabProps) {
  const [files, setFiles] = useState<(MediaFile & { policyNumber?: string })[]>([]);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [filterPolicy, setFilterPolicy] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploader, setShowUploader] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get all policy IDs for this client
      const { data: policyData } = await supabase
        .from('policies')
        .select('id, policy_number, policy_type_child')
        .eq('client_id', clientId);

      const pols: PolicyInfo[] = policyData || [];
      setPolicies(pols);
      const policyIds = pols.map(p => p.id);
      const policyMap = new Map(pols.map(p => [p.id, p.policy_number || 'بدون رقم']));

      // 2. Fetch all media files for these policies + client-level files
      const entityIds = [...policyIds, clientId];
      const entityTypes = ['policy', 'policy_insurance', 'policy_crm', 'client'];

      const { data: mediaData, error } = await supabase
        .from('media_files')
        .select('id, original_name, cdn_url, mime_type, size, created_at, entity_type, entity_id, storage_path')
        .in('entity_id', entityIds)
        .in('entity_type', entityTypes)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = (mediaData || []).map(f => ({
        ...f,
        policyNumber: f.entity_type === 'client'
          ? 'ملفات العميل'
          : policyMap.get(f.entity_id || '') || 'بدون رقم',
      }));

      setFiles(enriched);
    } catch (err) {
      console.error('Failed to fetch client files:', err);
      toast.error('فشل تحميل الملفات');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const filteredFiles = useMemo(() => {
    let result = files;

    if (filterPolicy !== 'all') {
      if (filterPolicy === 'client') {
        result = result.filter(f => f.entity_type === 'client');
      } else {
        result = result.filter(f => f.entity_id === filterPolicy);
      }
    }

    if (filterType !== 'all') {
      if (filterType === 'image') result = result.filter(f => f.mime_type?.startsWith('image/'));
      else if (filterType === 'pdf') result = result.filter(f => f.mime_type === 'application/pdf');
      else if (filterType === 'video') result = result.filter(f => f.mime_type?.startsWith('video/'));
      else if (filterType === 'doc') result = result.filter(f =>
        f.mime_type?.includes('word') || f.mime_type?.includes('document'));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(f => f.original_name?.toLowerCase().includes(term));
    }

    return result;
  }, [files, filterPolicy, filterType, searchTerm]);

  const allPreviewable = useMemo(
    () => filteredFiles.filter(f => isPreviewable(f.mime_type)),
    [filteredFiles]
  );

  const handleDownload = async (file: MediaFile) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-cdn-file`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ url: file.cdn_url }),
        }
      );
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.original_name || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('فشل تحميل الملف');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pr-9"
          />
        </div>

        <Select value={filterPolicy} onValueChange={setFilterPolicy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="كل البوالص" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل البوالص</SelectItem>
            <SelectItem value="client">ملفات العميل</SelectItem>
            {policies.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.policy_number || 'بدون رقم'} - {p.insurance_type || ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="كل الأنواع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="image">صور</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="video">فيديو</SelectItem>
            <SelectItem value="doc">مستندات</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUploader(!showUploader)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          رفع ملفات
        </Button>

        <Badge variant="secondary">{filteredFiles.length} ملف</Badge>
      </div>

      {/* Uploader */}
      {showUploader && (
        <Card className="p-4">
          <FileUploader
            entityType="client"
            entityId={clientId}
            onUploadComplete={() => {
              fetchFiles();
              setShowUploader(false);
              toast.success('تم رفع الملفات بنجاح');
            }}
          />
        </Card>
      )}

      {/* File Grid */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا توجد ملفات</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredFiles.map(file => {
            const Icon = getFileIcon(file.mime_type);
            const isImage = file.mime_type?.startsWith('image/');
            const isExternal = !file.storage_path;
            const canPreview = isPreviewable(file.mime_type);

            return (
              <div
                key={file.id}
                className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-all cursor-pointer"
                onClick={() => {
                  if (isExternal) {
                    window.open(file.cdn_url, '_blank');
                  } else if (canPreview) {
                    setPreviewFile(file);
                  }
                }}
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img
                      src={file.cdn_url}
                      alt={file.original_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Icon className="h-10 w-10 text-muted-foreground/50" />
                  )}
                </div>

                {/* Info */}
                <div className="p-2 space-y-1">
                  <p className="text-xs font-medium truncate" title={file.original_name}>
                    {file.original_name}
                  </p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {file.policyNumber}
                  </Badge>
                </div>

                {/* Hover Actions */}
                <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canPreview && !isExternal && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      onClick={e => {
                        e.stopPropagation();
                        setPreviewFile(file);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isExternal ? (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      onClick={e => {
                        e.stopPropagation();
                        window.open(file.cdn_url, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      onClick={e => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Gallery */}
      <FilePreviewGallery
        file={previewFile}
        allFiles={allPreviewable}
        onClose={() => setPreviewFile(null)}
        onNavigate={setPreviewFile}
      />
    </div>
  );
}
