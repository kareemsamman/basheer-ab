import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "date" | "number";

interface Props {
  value: string | number | null | undefined;
  kind: Kind;
  display: (v: any) => string;
  onSave: (newValue: string | number | null) => Promise<void>;
  className?: string;
  align?: "right" | "left" | "center";
  disabled?: boolean;
}

/**
 * Click-to-edit inline cell. On blur or Enter → saves.
 * Esc cancels. Shows a pencil icon on hover.
 */
export function InlineEditCell({
  value,
  kind,
  display,
  onSave,
  className,
  align = "right",
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      if (kind === "date") {
        const d = value ? String(value).split("T")[0] : "";
        setVal(d);
      } else {
        setVal(value == null ? "" : String(value));
      }
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [editing, value, kind]);

  const commit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (kind === "number") {
        const n = val.trim() === "" ? null : Number(val);
        if (n != null && Number.isNaN(n)) {
          setEditing(false);
          return;
        }
        const orig = value == null ? null : Number(value);
        if (n === orig) {
          setEditing(false);
          return;
        }
        await onSave(n);
      } else {
        const d = val.trim() === "" ? null : val;
        const orig = value ? String(value).split("T")[0] : null;
        if (d === orig) {
          setEditing(false);
          return;
        }
        await onSave(d);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (disabled) {
    return (
      <span className={cn("inline-block", className)}>{display(value)}</span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type={kind === "date" ? "date" : "number"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="h-7 px-2 py-1 text-xs w-[110px]"
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn(
        "group inline-flex items-center gap-1 rounded px-1.5 py-0.5 -mx-1 -my-0.5 hover:bg-accent/60 transition-colors cursor-text",
        align === "right" && "text-right",
        align === "left" && "text-left",
        align === "center" && "text-center",
        className
      )}
      title="انقر للتعديل"
    >
      <span>{display(value)}</span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-70 transition-opacity" />
    </button>
  );
}
