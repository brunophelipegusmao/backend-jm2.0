import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../drizzle/schema/health';
import { users } from '../drizzle/schema/users';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly databaseService: DatabaseService) {}

  getMe(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }

    return this.databaseService.database
      .select()
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async getProfileStatus(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [user] = await this.databaseService.database
      .select({ cpf: users.cpf })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    const [health] = await this.databaseService.database
      .select({ id: healthProfiles.id })
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);

    return {
      cpfFilled: !!user?.cpf,
      healthFilled: !!health,
    };
  }

  async completeProfile(
    session: { user?: { id?: string } },
    completeProfileDto: CompleteProfileDto,
  ) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }

    if (!completeProfileDto.cpf) {
      throw new BadRequestException('CPF é obrigatório');
    }

    const [existingCpf] = await this.databaseService.database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.cpf, completeProfileDto.cpf), isNull(users.deletedAt)))
      .limit(1);

    if (existingCpf && existingCpf.id !== session.user.id) {
      throw new BadRequestException('CPF já cadastrado');
    }

    const payload = {
      cpf: completeProfileDto.cpf,
      name: completeProfileDto.name ?? null,
      phone: completeProfileDto.phone ?? null,
      address: completeProfileDto.address ?? null,
      image: completeProfileDto.image ?? null,
    };

    const [user] = await this.databaseService.database
      .update(users)
      .set(payload)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .returning();
    return user ?? null;
  }
}
