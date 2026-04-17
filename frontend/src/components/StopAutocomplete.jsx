import { useEffect, useRef, useState } from "react";
import { searchStops } from "../lib/api.js";

export default function StopAutocomplete({ value, onChange, placeholder, disabled, inputId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const inputValue = typeof value === "string" ? value : value?.name || "";
  const listboxId = inputId ? `${inputId}-listbox` : undefined;
  const hasSuggestions = suggestions.length > 0;

  // Debounced search
  useEffect(() => {
    const queryText = inputValue.trim();

    if (!queryText) {
      setSuggestions([]);
      setActiveIndex(-1);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await searchStops(queryText);
        const nextSuggestions = data.stops || [];
        setSuggestions(nextSuggestions);
        setActiveIndex(nextSuggestions.length ? 0 : -1);
        setIsOpen(true);
      } catch (err) {
        setSuggestions([]);
        setActiveIndex(-1);
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectStop(stop) {
    onChange(stop);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (!isOpen || !hasSuggestions) {
      if (event.key === "ArrowDown" && hasSuggestions) {
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      handleSelectStop(suggestions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && (hasSuggestions || loading)}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 && listboxId ? `${listboxId}-option-${activeIndex}` : undefined}
        value={inputValue}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (hasSuggestions || loading) {
            setIsOpen(true);
          }
        }}
        disabled={disabled}
        autoComplete="off"
      />

      {isOpen && (hasSuggestions || loading) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white/95 shadow-xl ring-1 ring-slate-200/70 backdrop-blur">
          {loading ? (
            <div className="px-4 py-3 text-center text-sm text-slate-500">Naghahanap...</div>
          ) : (
            <ul id={listboxId} role="listbox" className="max-h-60 overflow-y-auto">
              {suggestions.map((stop, index) => (
                <li key={stop.id} id={listboxId ? `${listboxId}-option-${index}` : undefined} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={`w-full px-4 py-3 text-left text-sm transition focus:outline-none ${
                      index === activeIndex ? "bg-cyan-50" : "hover:bg-cyan-50"
                    }`}
                    onClick={() => handleSelectStop(stop)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="font-semibold text-slate-900">{stop.name}</div>
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
