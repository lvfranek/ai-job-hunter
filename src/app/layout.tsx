import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { IconDefaults } from "@/components/IconDefaults";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Job matches — AI Job Hunter",
    template: "%s — AI Job Hunter",
  },
  description: "Automated job search and match scoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[#101828] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <IconDefaults>
          <UnsavedChangesProvider>
            <DemoModeBanner />
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="min-w-0 flex-1">{children}</div>
            </div>
          </UnsavedChangesProvider>
        </IconDefaults>
      </body>
    </html>
  );
}
