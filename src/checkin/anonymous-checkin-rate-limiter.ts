import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type RateLimitEntry = { count: number; resetAt: number };

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

@Injectable()
export class AnonymousCheckinRateLimiter {
  private readonly windowMs = parsePositiveInt(
    process.env.CHECKIN_ANON_RATE_LIMIT_WINDOW_MS,
    60_000,
  );
  private readonly maxPerIdentifier = parsePositiveInt(
    process.env.CHECKIN_ANON_RATE_LIMIT_PER_IDENTIFIER,
    3,
  );
  private readonly maxPerIp = parsePositiveInt(
    process.env.CHECKIN_ANON_RATE_LIMIT_PER_IP,
    60,
  );
  private readonly store = new Map<string, RateLimitEntry>();
  private lastPruneAt = 0;
  private readonly pruneIntervalMs = Math.max(this.windowMs, 60_000);

  private prune(now: number) {
    if (now - this.lastPruneAt < this.pruneIntervalMs) {
      return;
    }
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
    this.lastPruneAt = now;
  }

  private touch(key: string, limit: number, now: number) {
    if (limit <= 0) {
      return;
    }
    const entry = this.store.get(key);
    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      throw new HttpException(
        'Muitas tentativas, tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  assertWithinLimit(payload: { ip?: string; identifiers?: string[] }) {
    const now = Date.now();
    this.prune(now);

    if (payload.ip) {
      this.touch(`ip:${payload.ip}`, this.maxPerIp, now);
    }

    if (payload.identifiers) {
      const identifiers = Array.from(new Set(payload.identifiers));
      for (const identifier of identifiers) {
        this.touch(`id:${identifier}`, this.maxPerIdentifier, now);
      }
    }
  }
}
