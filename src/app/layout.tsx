import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ToastContainer";
import { BanOverlay } from "@/components/BanOverlay";
import { PageTransitionProvider } from "@/components/PageTransitionProvider";

export const metadata: Metadata = {
  title: "Grandmaster Lens | Real-time Multiplayer Chess",
  description: "Play real-time multiplayer chess with grandmaster AI commentary and analysis powered by Gemini.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased flex flex-row overflow-hidden">
        <Sidebar />
        <BanOverlay />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto overflow-x-hidden relative">
          <PageTransitionProvider>
            {children}
          </PageTransitionProvider>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
