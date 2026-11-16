import { useState } from 'react';
import { PackageSearch } from 'lucide-react';

interface NoticeImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export function NoticeImage({ src, alt, className = 'w-full h-full object-cover' }: NoticeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-4 text-center text-slate-500"
        role="img"
        aria-label={alt}
      >
        <PackageSearch className="w-8 h-8 text-slate-400 mb-2" strokeWidth={1.6} />
        <span className="text-xs font-medium text-slate-600 line-clamp-2 max-w-[18ch]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
