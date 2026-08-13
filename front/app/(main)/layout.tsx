import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav, MobileHeader } from "@/components/MobileNav";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { AuthModalProvider } from "@/components/AuthModal";
import { TopUpModalProvider } from "@/components/TopUpModal";
import { PaymentGateModalProvider } from "@/components/PaymentGateModal";
import { WithdrawModalProvider } from "@/components/WithdrawModal";
import { PromoModalProvider } from "@/components/PromoModal";
import { WheelModalProvider } from "@/components/WheelModal";
import { QuickAuthModalProvider } from "@/components/QuickAuthModal";
import { ContestModalProvider } from "@/components/ContestModal";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthModalProvider>
      <TopUpModalProvider>
        <PaymentGateModalProvider>
          <WithdrawModalProvider>
            <PromoModalProvider>
              <WheelModalProvider>
                <QuickAuthModalProvider>
                  <ContestModalProvider>
                    {/* Мобильная шапка (показывается только на смартфонах) */}
                    <MobileHeader />

                    {/* Сайдбар (показывается от разрешения md: 768px) */}
                    <Sidebar />

                    <div className="flex-1 flex flex-col ml-0 md:ml-64 min-h-screen">
                      <PageTransition>{children}</PageTransition>
                      <Footer />
                    </div>

                    {/* Плавающий нижний бар (показывается только на смартфонах) */}
                    <MobileBottomNav />
                  </ContestModalProvider>
                </QuickAuthModalProvider>
              </WheelModalProvider>
            </PromoModalProvider>
          </WithdrawModalProvider>
        </PaymentGateModalProvider>
      </TopUpModalProvider>
    </AuthModalProvider>
  );
}
