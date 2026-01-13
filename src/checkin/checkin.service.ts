import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { checkinBlocks, checkins } from '../../drizzle/schema/checkin';
import { users } from '../../drizzle/schema/users';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';

const CHECKIN_ROLES = new Set(['STAFF', 'COACH', 'STUDENT']);

@Injectable()
export class CheckinService {
  constructor(private readonly databaseService: DatabaseService) {}

  private parseCheckedInAt(value?: string | Date) {
    if (!value) {
      return undefined;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('checkedInAt invalido');
    }
    return parsed;
  }

  private async ensureUserCanCheckin(userId: string) {
    const [user] = await this.databaseService.database
      .select({ role: users.role, active: users.active })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    if (!user.active) {
      throw new ForbiddenException('Usuario inativo');
    }

    if (!CHECKIN_ROLES.has(user.role)) {
      throw new ForbiddenException('Usuario sem permissao para check-in');
    }
  }

  private async ensureNotBlocked(userId: string, checkedInAt: Date) {
    const [block] = await this.databaseService.database
      .select({ id: checkinBlocks.id })
      .from(checkinBlocks)
      .where(
        and(
          eq(checkinBlocks.active, true),
          lte(checkinBlocks.startsAt, checkedInAt),
          gt(checkinBlocks.endsAt, checkedInAt),
          or(
            eq(checkinBlocks.userId, userId),
            isNull(checkinBlocks.userId),
          ),
        ),
      )
      .limit(1);

    if (block) {
      throw new ForbiddenException('Check-in bloqueado no momento');
    }
  }

  async createForUser(userId: string, createCheckinDto: CreateCheckinDto) {
    const checkedInAt =
      this.parseCheckedInAt(createCheckinDto.checkedInAt) ?? new Date();

    await this.ensureUserCanCheckin(userId);
    await this.ensureNotBlocked(userId, checkedInAt);

    const [checkin] = await this.databaseService.database
      .insert(checkins)
      .values({
        userId,
        checkedInAt,
      })
      .returning();

    return checkin ?? null;
  }

  findAll(userId?: string) {
    const query = this.databaseService.database
      .select()
      .from(checkins)
      .orderBy(desc(checkins.checkedInAt));

    if (userId) {
      return query.where(eq(checkins.userId, userId));
    }

    return query;
  }

  async findOne(id: number) {
    const [checkin] = await this.databaseService.database
      .select()
      .from(checkins)
      .where(eq(checkins.id, id))
      .limit(1);

    return checkin ?? null;
  }

  async update(id: number, updateCheckinDto: UpdateCheckinDto) {
    const checkedInAt = this.parseCheckedInAt(updateCheckinDto.checkedInAt);
    if (!checkedInAt) {
      throw new BadRequestException('checkedInAt e obrigatorio');
    }

    const [checkin] = await this.databaseService.database
      .update(checkins)
      .set({ checkedInAt })
      .where(eq(checkins.id, id))
      .returning();

    return checkin ?? null;
  }

  async remove(id: number) {
    const [checkin] = await this.databaseService.database
      .delete(checkins)
      .where(eq(checkins.id, id))
      .returning();

    return checkin ?? null;
  }

  async findLatestForUser(userId: string) {
    const [checkin] = await this.databaseService.database
      .select()
      .from(checkins)
      .where(eq(checkins.userId, userId))
      .orderBy(desc(checkins.checkedInAt))
      .limit(1);

    return checkin ?? null;
  }
}
