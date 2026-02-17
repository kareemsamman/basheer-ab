import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from "lucide-react";

interface PdfJsViewerProps {
  url: string;
  className?: string;
}

export function PdfJsViewer({ url, className = "" }: PdfJsViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF using proxy to bypass CORS/X-Frame-Options
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        // Dynamically import pdf.js
        const pdfjsLib = await import('pdfjs-dist');
        
        // For pdfjs-dist v5+, use unpkg worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        // Fetch PDF through proxy to bypass CORS/X-Frame-Options
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-cdn-file`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify({ url })
          }
        );

        if (!response.ok) throw new Error('Failed to load PDF');
        if (cancelled) return;

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        
        if (cancelled) return;

        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err: any) {
        console.error('PDF load error:', err);
        if (!cancelled) {
          setError(err.message || 'فشل تحميل الملف');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
    } catch (err) {
      console.error('Page render error:', err);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const goToPrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  };

  const zoomIn = () => setScale(s => Math.min(3, s + 0.25));
  const zoomOut = () => setScale(s => Math.max(0.5, s - 0.25));

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">جاري تحميل الملف...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center text-destructive">
          <p className="mb-2">{error}</p>
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary underline text-sm"
          >
            فتح في نافذة جديدة
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* PDF Controls */}
      <div className="flex items-center justify-center gap-2 py-2 bg-black/50 rounded-t-lg">
        <Button
          variant="ghost"
          size="icon"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="text-white hover:bg-white/20 h-8 w-8"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-white text-xs min-w-[50px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={zoomIn}
          disabled={scale >= 3}
          className="text-white hover:bg-white/20 h-8 w-8"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-4 bg-white/30 mx-2" />
        
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
          className="text-white hover:bg-white/20 h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-white text-xs min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="text-white hover:bg-white/20 h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas container */}
      <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/50 rounded-b-lg p-4">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
    </div>
  );
}
