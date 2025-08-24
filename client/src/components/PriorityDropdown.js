import React, { useEffect, useRef, useState } from "react";

const LABELS = ["high", "medium", "low"];
const styles = {
  high:   "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100",
  low:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100",
};

export default function PriorityDropdown({ value = "medium", onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // close on outside click / Esc
  useEffect(() => {
    const onDoc = (e) => {
      if (
        open &&
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = (value || "medium").toLowerCase();

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${styles[current]}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current.charAt(0).toUpperCase() + current.slice(1)}
        <svg className="h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.5 7.5l4.5 5 4.5-5H5.5z" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {LABELS.map((lvl) => (
            <button
              key={lvl}
              role="menuitem"
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                lvl === current ? "font-medium text-gray-900" : "text-gray-700"
              }`}
              onClick={() => {
                setOpen(false);
                if (lvl !== current) onChange?.(lvl);
              }}
            >
              {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
