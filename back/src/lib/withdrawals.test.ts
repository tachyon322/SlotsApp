import { describe, it, expect } from "bun:test";
import {
  buildMovementTimeline,
  movementQueueStart,
  movementStage1Minutes,
  WITHDRAWAL_PROCESSING_DAYS,
} from "./withdrawals";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CREATED_AT = new Date("2026-10-01T12:00:00.000Z");

function timelineAt(id: string, offsetMs: number, kind: "withdrawal" | "refund" = "withdrawal") {
  return buildMovementTimeline({
    id,
    createdAt: CREATED_AT,
    kind,
    now: new Date(CREATED_AT.getTime() + offsetMs),
  });
}

describe("buildMovementTimeline", () => {
  it("первая стадия длится 1–3 часа и не меняется между запросами", () => {
    for (let i = 0; i < 25; i += 1) {
      const id = `request-${i}`;
      const minutes = movementStage1Minutes(id);
      expect(minutes).toBeGreaterThanOrEqual(60);
      expect(minutes).toBeLessThanOrEqual(180);

      const early = timelineAt(id, 0);
      const later = timelineAt(id, 30 * MINUTE);
      expect(early.current).toBe("processing");
      expect(later.current).toBe("processing");
      // Дедлайн стадии одинаков в обоих запросах — «случайность» детерминирована.
      expect(later.steps[0].endsAt).toBe(early.steps[0].endsAt);
    }
  });

  it("вторая стадия начинается после первой и длится ровно 24 часа", () => {
    const id = "gateway-request";
    const stage1End = CREATED_AT.getTime() + movementStage1Minutes(id) * MINUTE;

    const beforeGateway = timelineAt(id, stage1End - CREATED_AT.getTime() - MINUTE);
    expect(beforeGateway.current).toBe("processing");
    expect(beforeGateway.steps[1].state).toBe("pending");

    const inGateway = timelineAt(id, stage1End - CREATED_AT.getTime() + MINUTE);
    expect(inGateway.current).toBe("gateway");
    expect(inGateway.steps[0].state).toBe("done");
    expect(inGateway.steps[1].state).toBe("current");
    expect(new Date(inGateway.steps[1].endsAt!).getTime() - stage1End).toBe(24 * HOUR);

    const afterGateway = timelineAt(id, stage1End - CREATED_AT.getTime() + 24 * HOUR + MINUTE);
    expect(afterGateway.current).toBe("queue");
    expect(afterGateway.steps[1].state).toBe("done");
    expect(afterGateway.steps[2].state).toBe("current");
  });

  it("очередь стартует в 1 000–5 000 и каждый день уменьшается до ~1 к дедлайну", () => {
    for (let i = 0; i < 30; i += 1) {
      const id = `queue-request-${i}`;
      const start = movementQueueStart(id);
      expect(start).toBeGreaterThanOrEqual(1000);
      expect(start).toBeLessThanOrEqual(5000);

      const stage2End = CREATED_AT.getTime() + movementStage1Minutes(id) * MINUTE + 24 * HOUR;
      const deadline = CREATED_AT.getTime() + WITHDRAWAL_PROCESSING_DAYS * DAY;
      const windowDays = Math.floor((deadline - stage2End) / DAY);

      const positions: number[] = [];
      for (let day = 0; day < windowDays; day += 1) {
        const timeline = timelineAt(id, stage2End - CREATED_AT.getTime() + day * DAY + MINUTE);
        const position = timeline.queue?.position;
        expect(position).toBeDefined();
        positions.push(position!);
      }

      expect(positions[0]).toBe(start);
      for (let day = 1; day < positions.length; day += 1) {
        expect(positions[day]).toBeLessThan(positions[day - 1]);
      }
      // К последнему дню до дедлайна очередь почти дошла.
      expect(positions[positions.length - 1]).toBeLessThanOrEqual(400);

      // Значение стабильно: повторный запрос в тот же день отдаёт то же место.
      const repeated = timelineAt(id, stage2End - CREATED_AT.getTime() + 10 * DAY + 5 * HOUR);
      const first = timelineAt(id, stage2End - CREATED_AT.getTime() + 10 * DAY + MINUTE);
      expect(repeated.queue?.position).toBe(first.queue?.position);

      // За минуту до дедлайна очередь заканчивается — место 1.
      const beforeDeadline = timelineAt(id, deadline - CREATED_AT.getTime() - MINUTE);
      expect(beforeDeadline.expired).toBe(false);
      expect(beforeDeadline.queue?.position).toBe(1);

      // На дедлайне заявка просрочена, очередь больше не показывается.
      const atDeadline = timelineAt(id, deadline - CREATED_AT.getTime());
      expect(atDeadline.expired).toBe(true);
      expect(atDeadline.queue).toBeNull();
    }
  });

  it("просроченный вывод падает с ошибкой и предлагает возврат", () => {
    const id = "expired-withdrawal";
    const expired = timelineAt(id, (WITHDRAWAL_PROCESSING_DAYS + 1) * DAY);

    expect(expired.expired).toBe(true);
    expect(expired.current).toBe("expired");
    expect(expired.steps).toHaveLength(3);
    expect(expired.steps[2].state).toBe("failed");
    expect(expired.steps[2].description).toContain("не смог выполнить выплату");
    expect(expired.queue).toBeNull();
  });

  it("просроченный возврат переходит в финальную проверку", () => {
    const id = "expired-refund";
    const expired = timelineAt(id, (WITHDRAWAL_PROCESSING_DAYS + 1) * DAY, "refund");

    expect(expired.expired).toBe(true);
    expect(expired.current).toBe("final_check");
    expect(expired.steps).toHaveLength(4);
    expect(expired.steps[2].state).toBe("done");
    expect(expired.steps[3].key).toBe("final_check");
    expect(expired.steps[3].state).toBe("current");
    expect(expired.steps[2].title).toContain("на возврат");
    expect(expired.steps[2].description).toContain("финальную проверку");
  });

  it("все даты шагов монотонны, а дедлайн — через 30 суток", () => {
    const id = "timeline-shape";
    const timeline = timelineAt(id, 10 * MINUTE);

    expect(new Date(timeline.deadline).getTime() - CREATED_AT.getTime()).toBe(
      WITHDRAWAL_PROCESSING_DAYS * DAY,
    );
    expect(timeline.steps[0].at).toBe(CREATED_AT.toISOString());
    const ends = timeline.steps.map((s) => new Date(s.endsAt!).getTime());
    expect(ends[0]).toBeLessThan(ends[1]);
    expect(ends[1]).toBeLessThan(ends[2]);
  });
});
