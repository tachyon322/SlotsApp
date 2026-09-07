import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav, MobileHeader } from "@/components/MobileNav";
import { Footer } from "@/components/Footer";
import { AuthModalProvider } from "@/components/AuthModal";
import { TopUpModalProvider } from "@/components/TopUpModal";
import { PaymentGateModalProvider } from "@/components/PaymentGateModal";
import { VerificationModalProvider } from "@/components/VerificationModal";
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
          <VerificationModalProvider>
            <WithdrawModalProvider>
            <PromoModalProvider>
              <WheelModalProvider>
                <QuickAuthModalProvider>
                  <ContestModalProvider>
                    {/* Мобильная шапка (показывается только на смартфонах) */}
                    <MobileHeader />

                    {/* Каркас хаба: сайдбар 184px + workspace */}
                    <div className="hub-shell">
                      <Sidebar />

                      <main className="hub-main">
                        {children}
                        <Footer />
                      </main>
                    </div>

                    {/* Плавающий нижний бар (показывается только на смартфонах) */}
                    <MobileBottomNav />
                  </ContestModalProvider>
                </QuickAuthModalProvider>
              </WheelModalProvider>
            </PromoModalProvider>
            </WithdrawModalProvider>
          </VerificationModalProvider>
        </PaymentGateModalProvider>
      </TopUpModalProvider>
    </AuthModalProvider>
  );
}
