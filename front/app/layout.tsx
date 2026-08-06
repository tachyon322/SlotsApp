import type { Metadata } from "next";
import { Unbounded, Inter } from "next/font/google";
import "./globals.css";
import { AuthModalProvider } from "@/components/AuthModal";
import { TopUpModalProvider } from "@/components/TopUpModal";
import { WithdrawModalProvider } from "@/components/WithdrawModal";
import { PaymentGateModalProvider } from "@/components/PaymentGateModal";
import { PromoModalProvider } from "@/components/PromoModal";
import { WheelModalProvider } from "@/components/WheelModal";
import { QuickAuthModalProvider } from "@/components/QuickAuthModal";
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

const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const metadata: Metadata = {
  title: "LITGAME GAMES",
  description: "Онлайн игры",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/apple-touch-icon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" />
        <link rel="dns-prefetch" href={apiOrigin} />
      </head>
      <body
        className={`${unbounded.variable} ${inter.variable} font-sans antialiased`}
      >
        <UserProvider>
          <AuthModalProvider>
            <TopUpModalProvider>
            <PaymentGateModalProvider>
            <WithdrawModalProvider>
            <PromoModalProvider>
            <WheelModalProvider>
            <QuickAuthModalProvider>
            {children}
            </QuickAuthModalProvider>
            </WheelModalProvider>
            </PromoModalProvider>
            </WithdrawModalProvider>
            </PaymentGateModalProvider>
            </TopUpModalProvider>
          </AuthModalProvider>
        </UserProvider>
      </body>
    </html>
  );
}
