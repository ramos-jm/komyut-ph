import { useEffect, useRef, useState } from "react";
import { searchStops } from "../lib/api.js";

export default function StopAutocomplete({ value, onChange, placeholder, disabled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!value || value.length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await searchStops(value);
        setSuggestions(data.stops || []);
        setIsOpen(true);
      } catch (err) {
        setSuggestions([]);
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectStop(stop) {
    onChange(stop);
    setIsOpen(false);
    setSuggestions([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sea disabled:bg-slate-50"
        placeholder={placeholder}
        value={value.name || value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        disabled={disabled}
        autoComplete="off"
      />

      {isOpen && (suggestions.length > 0 || loading) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-4 py-3 text-center text-sm text-slate-500">Naghahanap...</div>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {suggestions.map((stop) => (
                <li key={stop.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm transition hover:bg-sky-50 focus:bg-sky-50 focus:outline-none"
                    onClick={() => handleSelectStop(stop)}
                  >
                    <div className="font-semibold text-ink">{stop.name}</div>
                    <div className="text-xs text-slate-500">
                      {stop.route_count} routes • {stop.type}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
