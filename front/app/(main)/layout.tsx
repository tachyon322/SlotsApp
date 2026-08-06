import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav, MobileHeader } from "@/components/MobileNav";
import { Footer } from "@/components/Footer";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
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
    </>
  );
}
