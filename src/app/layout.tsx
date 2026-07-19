import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { AutoSyncProvider } from "@/providers/AutoSyncProvider";
import { UndoProvider } from "@/components/ui/undo-toast";
import { AppLockProvider } from "@/providers/AppLockProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PennyFlow - Personal Finance Tracker",
  description: "A local-first personal finance tracker for managing net worth, cash flow, assets, liabilities, and investments.",
  manifest: "/manifest.json",
  icons: {
    icon: "/app-assets/favicon.png",
    apple: "/app-assets/favicon.png",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme="light" storageKey="finance-os-theme">
          <AuthProvider>
            <AutoSyncProvider>
              <AppLockProvider>
                <UndoProvider>
                  {children}
                </UndoProvider>
              </AppLockProvider>
            </AutoSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
