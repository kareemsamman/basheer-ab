import { useState, useEffect, useCallback, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FileUploader } from "@/components/media/FileUploader";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  FolderPlus,
  Upload,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  Home,
  Copy,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { format } from "date-fns";

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

interface FileRow {
  id: string;
  folder_id: string;
  name: string;
  file_url: string;
  file_type: string;
  mime_type: string | null;
  overlay_fields: any;
  created_at: string;
}

export default function FormTemplates() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "نماذج" },
  ]);
  const [initialFolderLoaded, setInitialFolderLoaded] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounter = useRef(0);

  // On mount, read folder query param and build breadcrumbs
  useEffect(() => {
    if (initialFolderLoaded) return;
    const folderId = searchParams.get("folder");
    if (!folderId) {
      setInitialFolderLoaded(true);
      return;
    }

    (async () => {
      try {
        // Build breadcrumb chain by walking up parent_id
        const chain: { id: string; name: string }[] = [];
        let currentId: string | null = folderId;
        while (currentId) {
          const { data, error } = await supabase
            .from("form_template_folders")
            .select("id, name, parent_id")
            .eq("id", currentId)
            .single();
          if (error || !data) break;
          chain.unshift({ id: data.id, name: data.name });
          currentId = data.parent_id;
        }
        if (chain.length > 0) {
          setBreadcrumbs([{ id: null, name: "نماذج" }, ...chain.map(c => ({ id: c.id as string | null, name: c.name }))]);
          setCurrentFolderId(folderId);
        }
      } catch (err) {
        console.error("Failed to load folder path:", err);
      } finally {
        setInitialFolderLoaded(true);
        // Clear the query param
        setSearchParams({}, { replace: true });
      }
    })();
  }, [searchParams, initialFolderLoaded, setSearchParams]);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: "folder" | "file" } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: "folder" | "file" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // Fetch folders and files for current folder
  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      const folderQuery = supabase
        .from("form_template_folders")
        .select("*")
        .order("name");

      if (currentFolderId) {
        folderQuery.eq("parent_id", currentFolderId);
      } else {
        folderQuery.is("parent_id", null);
      }

      const { data: foldersData, error: foldersErr } = await folderQuery;
      if (foldersErr) throw foldersErr;

      let filesData: FileRow[] = [];
      if (currentFolderId) {
        const { data, error } = await supabase
          .from("form_template_files")
          .select("*")
          .eq("folder_id", currentFolderId)
          .order("name");
        if (error) throw error;
        filesData = (data || []) as FileRow[];
      }

      setFolders((foldersData || []) as FolderRow[]);
      setFiles(filesData);
    } catch (err: any) {
      console.error(err);
      toast({ title: "خطأ", description: "فشل في تحميل المحتوى", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, toast]);

  useEffect(() => {
    if (initialFolderLoaded) fetchContents();
  }, [fetchContents, initialFolderLoaded]);

  // Navigate into folder
  const openFolder = (folder: FolderRow) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  // Navigate via breadcrumb
  const navigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolderId(target.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("form_template_folders").insert({
        name: folderName.trim(),
        parent_id: currentFolderId,
        created_by: profile?.id,
      });
      if (error) throw error;
      toast({ title: "تم إنشاء المجلد" });
      setNewFolderOpen(false);
      setFolderName("");
      fetchContents();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Rename
  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setSaving(true);
    try {
      const table = renameTarget.type === "folder" ? "form_template_folders" : "form_template_files";
      const { error } = await supabase.from(table).update({ name: renameName.trim() }).eq("id", renameTarget.id);
      if (error) throw error;
      toast({ title: "تم إعادة التسمية" });
      setRenameOpen(false);
      setRenameTarget(null);
      fetchContents();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const table = deleteTarget.type === "folder" ? "form_template_folders" : "form_template_files";
      const { error } = await supabase.from(table).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف" });
      setDeleteTarget(null);
      fetchContents();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  // Duplicate file
  const handleDuplicate = async (file: FileRow) => {
    setDuplicating(file.id);
    try {
      const { error } = await supabase.from("form_template_files").insert({
        folder_id: file.folder_id,
        name: `${file.name} (نسخة)`,
        file_url: file.file_url,
        file_type: file.file_type,
        mime_type: file.mime_type,
        overlay_fields: file.overlay_fields,
        created_by: profile?.id,
      });
      if (error) throw error;
      toast({ title: "تم نسخ الملف" });
      fetchContents();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDuplicating(null);
    }
  };

  // Handle file upload complete
  const handleUploadComplete = async (uploadedFiles: any[]) => {
    if (!currentFolderId) {
      toast({ title: "خطأ", description: "يجب أن تكون داخل مجلد لرفع الملفات", variant: "destructive" });
      return;
    }

    try {
      const rows = uploadedFiles.map((f) => {
        const isPdf = f.mime_type === "application/pdf" || f.original_name?.toLowerCase().endsWith(".pdf");
        return {
          folder_id: currentFolderId,
          name: f.original_name || "ملف",
          file_url: f.cdn_url,
          file_type: isPdf ? "pdf" : "image",
          mime_type: f.mime_type || null,
          overlay_fields: [],
          created_by: profile?.id,
        };
      });

      const { error } = await supabase.from("form_template_files").insert(rows);
      if (error) throw error;

      toast({ title: "تم رفع الملفات بنجاح" });
      setUploadOpen(false);
      fetchContents();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    if (!currentFolderId) {
      toast({ title: "خطأ", description: "يجب أن تكون داخل مجلد لرفع الملفات", variant: "destructive" });
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    // Filter valid files
    const validFiles = droppedFiles.filter(f => {
      const isValid = f.type.startsWith("image/") || f.type === "application/pdf";
      if (!isValid) {
        toast({ title: "تم تجاهل ملف", description: `${f.name} - نوع غير مدعوم`, variant: "destructive" });
      }
      return isValid;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "خطأ", description: "يجب تسجيل الدخول", variant: "destructive" });
        return;
      }

      const uploadedRows: { folder_id: string; name: string; file_url: string; file_type: string; mime_type: string; overlay_fields: any[]; created_by: string | undefined }[] = [];

      for (const file of validFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entity_type", "form_template");

        const res = await supabase.functions.invoke("upload-media", {
          body: formData,
        });

        if (res.error || !res.data?.file) {
          toast({ title: "خطأ في الرفع", description: `فشل رفع ${file.name}`, variant: "destructive" });
          continue;
        }

        const isPdf = file.type === "application/pdf";
        uploadedRows.push({
          folder_id: currentFolderId,
          name: file.name,
          file_url: res.data.file.cdn_url,
          file_type: isPdf ? "pdf" : "image",
          mime_type: file.type,
          overlay_fields: [],
          created_by: profile?.id,
        });
      }

      if (uploadedRows.length > 0) {
        const { error } = await supabase.from("form_template_files").insert(uploadedRows);
        if (error) throw error;
        toast({ title: `تم رفع ${uploadedRows.length} ملف بنجاح` });
        fetchContents();
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [currentFolderId, profile?.id, toast, fetchContents]);

  return (
    <MainLayout>
      <div
        className="p-4 md:p-6 space-y-4 relative min-h-[calc(100vh-4rem)]"
        dir="rtl"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
            <div className="flex flex-col items-center gap-3 text-primary">
              <Upload className="h-16 w-16 animate-bounce" />
              <p className="text-xl font-bold">أسقط الملفات هنا للرفع</p>
              {!currentFolderId && (
                <p className="text-sm text-destructive">يجب الدخول إلى مجلد أولاً</p>
              )}
            </div>
          </div>
        )}

        {/* Uploading indicator */}
        {isUploading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 bg-card p-8 rounded-xl shadow-lg border">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-lg font-medium">جارٍ رفع الملفات...</p>
            </div>
          </div>
        )}
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 flex-wrap">
          {breadcrumbs.map((bc, idx) => (
            <div key={idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
              <button
                onClick={() => navigateBreadcrumb(idx)}
                className={`text-sm font-medium transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? "text-foreground"
                    : "text-primary hover:underline"
                }`}
              >
                {idx === 0 ? (
                  <span className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    {bc.name}
                  </span>
                ) : (
                  bc.name
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <Button onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-4 w-4 ml-2" />
            مجلد جديد
          </Button>
          {currentFolderId && (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 ml-2" />
              رفع ملف
            </Button>
          )}
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Folder className="h-16 w-16" />
            <p className="text-lg">
              {currentFolderId ? "هذا المجلد فارغ" : "لا توجد مجلدات بعد"}
            </p>
            <p className="text-sm">
              {currentFolderId
                ? "أضف مجلدات فرعية أو ارفع ملفات"
                : "أنشئ مجلداً جديداً للبدء"}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right w-12"></TableHead>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right w-24">النوع</TableHead>
                  <TableHead className="text-right w-36">التاريخ</TableHead>
                  <TableHead className="text-right w-20">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Folders */}
                {folders.map((folder) => (
                  <TableRow
                    key={`folder-${folder.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => openFolder(folder)}
                  >
                    <TableCell>
                      <Folder className="h-5 w-5 text-amber-500" />
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      onClick={() => openFolder(folder)}
                    >
                      {folder.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">مجلد</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(folder.created_at), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openRename(folder.id, folder.name, "folder")}>
                            <Pencil className="h-4 w-4 ml-2" />
                            إعادة تسمية
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: folder.id, name: folder.name, type: "folder" })}
                          >
                            <Trash2 className="h-4 w-4 ml-2" />
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Files */}
                {files.map((file) => (
                  <TableRow
                    key={`file-${file.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => navigate(`/form-templates/edit/${file.id}`)}
                  >
                    <TableCell>
                      {file.file_type === "pdf" ? (
                        <FileText className="h-5 w-5 text-red-500" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-blue-500" />
                      )}
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      onClick={() => navigate(`/form-templates/edit/${file.id}`)}
                    >
                      {file.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {file.file_type === "pdf" ? "PDF" : "صورة"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(file.created_at), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/form-templates/edit/${file.id}`)}>
                            <Pencil className="h-4 w-4 ml-2" />
                            تحرير
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(file)}>
                            <Copy className="h-4 w-4 ml-2" />
                            نسخ
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRename(file.id, file.name, "file")}>
                            <Pencil className="h-4 w-4 ml-2" />
                            إعادة تسمية
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: file.id, name: file.name, type: "file" })}
                          >
                            <Trash2 className="h-4 w-4 ml-2" />
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* New Folder Dialog */}
        <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>مجلد جديد</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="اسم المجلد..."
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>إلغاء</Button>
              <Button onClick={handleCreateFolder} disabled={saving || !folderName.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                إنشاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>رفع ملفات</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <FileUploader
                entityType="form_template"
                accept="application/pdf,image/*"
                onUploadComplete={handleUploadComplete}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إعادة تسمية</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameOpen(false)}>إلغاء</Button>
              <Button onClick={handleRename} disabled={saving || !renameName.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={handleDelete}
          title={`حذف ${deleteTarget?.type === "folder" ? "المجلد" : "الملف"}`}
          description={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟ ${
            deleteTarget?.type === "folder" ? "سيتم حذف جميع محتويات المجلد." : ""
          }`}
        />
      </div>
    </MainLayout>
  );
}
