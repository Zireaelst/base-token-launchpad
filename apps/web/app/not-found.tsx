import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-pixel text-4xl">404</p>
      <p className="mt-2 font-mono text-sm text-mute">Nothing here. The token may not be indexed yet.</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center bg-ink px-5 font-mono text-sm uppercase text-bg"
      >
        Back to the board
      </Link>
    </div>
  );
}
