import type { Metadata } from "next";
import { InfoPage, type InfoSection } from "@/components/InfoPage";
import { Gamepad2 } from "lucide-react";

export const metadata: Metadata = {
  title: "О нас — LITGAME GAMES",
};

const SECTIONS: InfoSection[] = [
  {
    title: "Кто мы",
    content: [
      "LITGAME GAMES — онлайн-платформа с азартными развлечениями: Crash, слоты, Mines, кейсы, MineDrop и BlockBlast. Мы делаем игры, в которых каждый может испытать удачу и умножить баланс.",
    ],
  },
  {
    title: "Наша миссия",
    content: [
      "Мы стремимся создавать честную и прозрачную среду для игры. Все результаты формируются случайным образом, а вывод выигрышей происходит максимально быстро.",
    ],
  },
  {
    title: "Контакты",
    content: [
      "По любым вопросам пишите в техническую поддержку — мы на связи 24/7 и отвечаем в среднем за пару минут.",
    ],
  },
];

export default function AboutPage() {
  return (
    <InfoPage
      icon={Gamepad2}
      title="О нас"
      intro="Коротко о том, кто мы и чем занимаемся."
      sections={SECTIONS}
    />
  );
}
