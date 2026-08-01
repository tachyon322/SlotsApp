import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav, MobileHeader } from "@/components/MobileNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SWAGA GAMES",
  description: "Онлайн игры",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
{/* Мобильная шапка (показывается только на смартфонах) */}
        <MobileHeader />

        {/* Сайдбар (показывается от разрешения md: 768px) */}
        <Sidebar />

        {/* Контент страницы */}
        {children}

        {/* Плавающий нижний бар (показывается только на смартфонах) */}
        <MobileBottomNav />
      </body>
    </html>
  );
}
