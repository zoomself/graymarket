"use client";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBox({
  value,
  onChange,
  placeholder = "搜索名称或代码",
}: SearchBoxProps) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-8 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#FF5500] sm:w-64"
      />
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
        />
      </svg>
      {value && (
        <button
          type="button"
          aria-label="清除搜索"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-zinc-500 hover:text-zinc-200"
        >
          ×
        </button>
      )}
    </div>
  );
}
