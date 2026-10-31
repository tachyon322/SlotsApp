import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import { AffiliateRefTracker } from "@/components/AffiliateRefTracker";
import { Toaster } from "@/components/ui/toaster";
import { Analytics } from "@/components/Analytics";

export const viewport: Viewport = {
  themeColor: "#0E0E0E",
};

export const metadata: Metadata = {
  title: "STARX GAMES",
  description: "Онлайн игры",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-accent="white">
      <body className="font-sans antialiased">
        {/* Фильтр путей должен существовать до загрузки трекера: он читается из
            data-before-send в момент инициализации, поэтому это beforeInteractive-инлайн,
            а не useEffect (трекер успел бы первым). Выполняется один раз на документ. */}
        <Script id="umami-before-send" strategy="beforeInteractive">
          {`window.__umamiBeforeSend=function(_t,p){try{var u=String(p&&p.url||"");var n=new URL(u,location.origin).pathname;if(n.indexOf("/adminlitgame43144")===0||n.indexOf("/gjiweg32tji32")===0)return false}catch(e){}return p};`}
        </Script>
        <UserProvider>
          <AffiliateRefTracker />
          {children}
          <Toaster />
        </UserProvider>
        <Analytics />
      </body>
    </html>
  );
}
