import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-1.3">
      <div className="text-center max-w-2.1">
        <p className="text-2.1 font-sans tracking-widest uppercase text-white/60 mb-3.4">
          404
        </p>
        <h1 className="text-8.9 font-serif mb-5.5 leading-none">
          This page is still being written.
        </h1>
        <p className="text-2.1 text-white/70 mb-8.9">
          The villa or experience you were looking for hasn't been added to the
          site yet, or the link is from an earlier version.
        </p>
        <Link
          href="/"
          className="inline-block text-1.3 tracking-widest uppercase border-b border-white/30 hover:border-white pb-0.8 transition-colors"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
