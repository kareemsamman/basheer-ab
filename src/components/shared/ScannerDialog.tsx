import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  X,
  RotateCcw,
  Loader2,
  Trash2,
  Save,
  SwitchCamera,
  Crop,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CapturedImage {
  id: string;
  original: string;
  cropped: string | null;
  processing: boolean;
}

interface ScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (images: Blob[]) => Promise<void>;
  title?: string;
}

// Declare jscanify types
declare class jscanify {
  highlightPaper(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): HTMLCanvasElement;
  extractPaper(
    image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    width: number,
    height: number
  ): HTMLCanvasElement;
}

export function ScannerDialog({
  open,
  onOpenChange,
  onSave,
  title = "مسح ضوئي",
}: ScannerDialogProps) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<jscanify | null>(null);
  const animationRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [showHighlight, setShowHighlight] = useState(true);

  // Initialize jscanify
  useEffect(() => {
    if (open && !scannerRef.current) {
      // Dynamically import jscanify
      import("jscanify").then((module) => {
        const Jscanify = module.default;
        scannerRef.current = new Jscanify();
        setScannerReady(true);
      }).catch((err) => {
        console.error("Failed to load jscanify:", err);
        // Continue without edge detection
        setScannerReady(true);
      });
    }
  }, [open]);

  // Real-time edge detection overlay
  const highlightDocument = useCallback(() => {
    if (!webcamRef.current?.video || !highlightCanvasRef.current || !scannerRef.current || !showHighlight) {
      animationRef.current = requestAnimationFrame(highlightDocument);
      return;
    }

    const video = webcamRef.current.video;
    const canvas = highlightCanvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(highlightDocument);
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      // Use jscanify to highlight detected paper
      const resultCanvas = scannerRef.current.highlightPaper(video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(resultCanvas, 0, 0);
    } catch (e) {
      // Ignore errors - document may not be detected
    }

    animationRef.current = requestAnimationFrame(highlightDocument);
  }, [showHighlight]);

  // Start/stop highlight animation
  useEffect(() => {
    if (cameraReady && scannerReady && showHighlight) {
      animationRef.current = requestAnimationFrame(highlightDocument);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraReady, scannerReady, showHighlight, highlightDocument]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCapturedImages([]);
      setCameraReady(false);
      setCameraError(null);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, [open]);

  const handleUserMedia = useCallback(() => {
    setCameraReady(true);
    setCameraError(null);
  }, []);

  const handleUserMediaError = useCallback((error: string | DOMException) => {
    console.error("Camera error:", error);
    setCameraError(
      typeof error === "string" ? error : "لم يتم السماح بالوصول للكاميرا"
    );
  }, []);

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  const captureImage = useCallback(async () => {
    if (!webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    const imageId = crypto.randomUUID();

    // Add image as processing
    setCapturedImages((prev) => [
      ...prev,
      { id: imageId, original: imageSrc, cropped: null, processing: true },
    ]);

    // Process with edge detection
    try {
      if (scannerRef.current) {
        // Create image element to process
        const img = new Image();
        img.src = imageSrc;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // Extract and crop the document
        const croppedCanvas = scannerRef.current.extractPaper(img, 800, 1000);
        const croppedSrc = croppedCanvas.toDataURL("image/jpeg", 0.9);

        setCapturedImages((prev) =>
          prev.map((item) =>
            item.id === imageId
              ? { ...item, cropped: croppedSrc, processing: false }
              : item
          )
        );
      } else {
        // No scanner available, use original
        setCapturedImages((prev) =>
          prev.map((item) =>
            item.id === imageId
              ? { ...item, cropped: imageSrc, processing: false }
              : item
          )
        );
      }
    } catch (error) {
      console.error("Edge detection failed:", error);
      // Use original if edge detection fails
      setCapturedImages((prev) =>
        prev.map((item) =>
          item.id === imageId
            ? { ...item, cropped: imageSrc, processing: false }
            : item
        )
      );
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setCapturedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (capturedImages.length === 0) return;

    setSaving(true);
    try {
      // Convert images to blobs
      const blobs = await Promise.all(
        capturedImages.map(async (img) => {
          const imageToUse = img.cropped || img.original;
          const response = await fetch(imageToUse);
          return response.blob();
        })
      );

      await onSave(blobs);
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  }, [capturedImages, onSave, onOpenChange]);

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-full sm:max-w-3xl h-[90vh] p-0 gap-0 flex flex-col"
        dir="rtl"
      >
        <DialogHeader className="p-4 pb-2 flex-none border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              {title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showHighlight ? "default" : "outline"}
                onClick={() => setShowHighlight(!showHighlight)}
                className="gap-1"
              >
                <Crop className="h-4 w-4" />
                {showHighlight ? "إخفاء الحدود" : "إظهار الحدود"}
              </Button>
              <Button size="icon" variant="ghost" onClick={switchCamera}>
                <SwitchCamera className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            وجّه الكاميرا نحو المستند. سيتم اكتشاف حدود الورقة تلقائياً وقصها.
          </DialogDescription>
        </DialogHeader>

        {/* Camera View */}
        <div className="relative flex-1 bg-black overflow-hidden">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 p-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-center">{cameraError}</p>
              <Button variant="secondary" onClick={() => setCameraError(null)}>
                <RotateCcw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <>
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                screenshotQuality={0.9}
                videoConstraints={videoConstraints}
                onUserMedia={handleUserMedia}
                onUserMediaError={handleUserMediaError}
                className="w-full h-full object-contain"
              />
              {/* Edge detection overlay */}
              <canvas
                ref={highlightCanvasRef}
                className={cn(
                  "absolute inset-0 w-full h-full object-contain pointer-events-none",
                  !showHighlight && "hidden"
                )}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
            </>
          )}

          {/* Capture button */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <Button
              size="lg"
              className="h-16 w-16 rounded-full shadow-lg"
              disabled={!cameraReady || saving}
              onClick={captureImage}
            >
              <Camera className="h-8 w-8" />
            </Button>
          </div>
        </div>

        {/* Captured images gallery */}
        {capturedImages.length > 0 && (
          <div className="p-3 border-t bg-muted/30 flex-none">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">
                الصور الملتقطة ({capturedImages.length})
              </span>
              <Badge variant="secondary" className="gap-1">
                <Crop className="h-3 w-3" />
                قص تلقائي
              </Badge>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {capturedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative flex-none w-20 h-20 rounded-lg overflow-hidden border bg-background"
                >
                  {img.processing ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <img
                        src={img.cropped || img.original}
                        alt="Captured"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {img.cropped && (
                        <div className="absolute bottom-1 left-1">
                          <Check className="h-3 w-3 text-green-500 bg-white rounded-full" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="p-4 border-t flex-none flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 ml-2" />
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={capturedImages.length === 0 || saving || capturedImages.some((img) => img.processing)}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 ml-2" />
            )}
            حفظ {capturedImages.length > 0 && `(${capturedImages.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
