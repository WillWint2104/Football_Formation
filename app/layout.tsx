import type { Metadata } from "next";
import { Inter, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Football Formation",
  description:
    "Football Formation coaching workspace and tactical lineup builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${hanken.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="application-shell min-h-screen flex bg-background text-on-background font-sans">
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-50 -translate-y-20 rounded bg-primary px-4 py-2 text-on-primary focus:translate-y-0"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-screen-2xl flex-1 p-4 outline-none md:p-6 xl:p-8"
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
