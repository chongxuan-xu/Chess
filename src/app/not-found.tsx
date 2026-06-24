import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 text-center font-sans select-none">
      <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-amber-500 mb-6 font-display animate-pulse">
        <Compass className="w-12 h-12" />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 font-display">
        Coordinate Lost (404)
      </h1>
      <p className="text-slate-400 max-w-sm text-sm mb-8 leading-relaxed">
        The coordinate you are looking for does not exist on this board.
      </p>
      <Link 
        href="/"
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg hover:shadow-xl hover:shadow-amber-500/15"
      >
        <Home className="w-4 h-4" />
        Back to Lobby
      </Link>
    </div>
  );
}
