'use client';

import {
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  MessageCircle,
} from "lucide-react";
import { HeroCarousel } from "@/components/HeroCarousel";
import { useWithdrawModal } from "@/components/WithdrawModal";
import { useTopUpModal } from "@/components/TopUpModal";
import { usePromoModal } from "@/components/PromoModal";
import { useAuthModal } from "@/components/AuthModal";
import { useUser } from "@/components/UserProvider";

export function HomeActions() {
  const { openWithdraw } = useWithdrawModal();
  const { openTopUp } = useTopUpModal();
  const { openPromo } = usePromoModal();
  const { openAuth } = useAuthModal();
  const { user } = useUser();

  const handlePromo = () => {
    if (user) {
      openPromo();
    } else {
      openAuth('signin');
    }
  };

  const handleWithdraw = () => {
    if (user) {
      openWithdraw();
    } else {
      openAuth('signin');
    }
  };

  const handleDeposit = () => {
    if (user) {
      openTopUp();
    } else {
      openAuth('signin');
    }
  };

  const handleSupport = () => {
    document.getElementById('support')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* Hero-карусель акций */}
      <HeroCarousel onDeposit={handleDeposit} onPromo={handlePromo} />

      {/* Быстрые кнопки действия */}
      <div className="flex gap-xs py-md flex-wrap">
        <button onClick={handlePromo} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
          <Gift className="w-4 h-4 text-yellow-400" />
          <span>Промокод</span>
        </button>
        <button onClick={handleWithdraw} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
          <ArrowUpRight className="w-4 h-4 text-purple-400" />
          <span>Вывести</span>
        </button>
        <button onClick={handleDeposit} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
          <ArrowDownRight className="w-4 h-4 text-emerald-400" />
          <span>Депозит</span>
        </button>
        <button onClick={handleSupport} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
          <MessageCircle className="w-4 h-4 text-blue-400" />
          <span>Поддержка</span>
        </button>
      </div>
    </>
  );
}
