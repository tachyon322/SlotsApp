import type { Metadata } from "next";
import { Unbounded, Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav, MobileHeader } from "@/components/MobileNav";
import { Footer } from "@/components/Footer";
import { AuthModalProvider } from "@/components/AuthModal";
import { TopUpModalProvider } from "@/components/TopUpModal";
import { WithdrawModalProvider } from "@/components/WithdrawModal";
import { PromoModalProvider } from "@/components/PromoModal";
import { UserProvider } from "@/components/UserProvider";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: "800",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LITGAME GAMES",
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
        className={`${unbounded.variable} ${inter.variable} font-sans antialiased`}
      >
        <UserProvider>
          <AuthModalProvider>
            <TopUpModalProvider>
            <WithdrawModalProvider>
            <PromoModalProvider>
            {/* Мобильная шапка (показывается только на смартфонах) */}
            <MobileHeader />

            {/* Сайдбар (показывается от разрешения md: 768px) */}
            <Sidebar />

            <div className="flex-1 flex flex-col ml-0 md:ml-64 min-h-screen">
              {children}
              <Footer />
            </div>

            {/* Плавающий нижний бар (показывается только на смартфонах) */}
            <MobileBottomNav />
            </PromoModalProvider>
            </WithdrawModalProvider>
            </TopUpModalProvider>
          </AuthModalProvider>
        </UserProvider>
      </body>
    </html>
  );
}
