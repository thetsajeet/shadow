import type { Metadata } from "next";
import { Fira_Code, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fira = Fira_Code({ variable: "--font-fira", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "Shadow — instant wikis for GitHub repos",
  description: "Sign in with GitHub and turn your repositories into living documentation, with diagrams, source links and Q&A.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fira.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
