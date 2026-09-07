"use client";

import { useState } from "react";
import { Toaster } from "react-hot-toast";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { GoogleAuthProvider } from "@/components/GoogleAuthProvider";

// The signed-in application's frame.
//
// The ground is cream rather than `bg-gray-50`, so the app and the landing
// page share one surface instead of the app looking like a different product
// once you sign in.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <GoogleAuthProvider>
      <div className="flex min-h-screen flex-col bg-cream-100">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-1">
          <Sidebar open={sidebarOpen} />
          <main className="ml-0 flex-1 p-4 transition-all duration-300 lg:ml-64 lg:p-10">
            {children}
          </main>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            // Matches the app's own surfaces rather than the library default
            // white-on-white, which vanished against a light page.
            style: { background: "#001c09", color: "#f9f7f1", borderRadius: "0.875rem" },
          }}
        />
      </div>
    </GoogleAuthProvider>
  );
}
