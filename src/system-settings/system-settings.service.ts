import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { InferModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { systemSettingsTable } from '../drizzle/schema/systemSettings';
import type { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { ConfigService } from '@nestjs/config';

type SystemSettingsRow = InferModel<typeof systemSettingsTable, 'select'>;

type OperatingSegment = { start: string; end: string };
type DaySchedule = { day: string; segments: OperatingSegment[] };

export type SystemSettingsResponse = {
  id: string;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  maintenanceAllowedRoutes: string[];
  operatingHours: DaySchedule[];
  contact: {
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    whatsappLink: string | null;
  };
  socialLinks: Record<string, string | null>;
  carouselImages: { imageUrl: string; altText?: string | null }[];
  promoPopups: Array<{
    type: 'lightbox' | 'welcome' | 'modal';
    imageUrl: string;
    link?: string;
    active?: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_OPERATING_HOURS: DaySchedule[] = [
  { day: 'monday', segments: [{ start: '06:00', end: '22:00' }] },
  { day: 'tuesday', segments: [{ start: '06:00', end: '22:00' }] },
  { day: 'wednesday', segments: [{ start: '06:00', end: '22:00' }] },
  { day: 'thursday', segments: [{ start: '06:00', end: '22:00' }] },
  { day: 'friday', segments: [{ start: '06:00', end: '22:00' }] },
  { day: 'saturday', segments: [{ start: '08:00', end: '18:00' }] },
  { day: 'sunday', segments: [{ start: '08:00', end: '14:00' }] },
];

const DEFAULT_MAINTENANCE_ROUTES = ['/contacts', '/checkin'];

const hasMasterRole = (role?: string | string[]) => {
  if (typeof role === 'string') {
    return role === 'MASTER';
  }
  if (Array.isArray(role)) {
    return role.includes('MASTER');
  }
  return false;
};

const hasAdminRole = (role?: string | string[]) => {
  if (typeof role === 'string') {
    return role === 'ADMIN';
  }
  if (Array.isArray(role)) {
    return role.includes('ADMIN');
  }
  return false;
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
};

const ensureOperatingHours = (value: unknown): DaySchedule[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.day !== 'string' ||
        !Array.isArray(entry.segments)
      ) {
        return null;
      }
      const segments = entry.segments
        .map((segment: unknown) => {
          if (
            typeof segment === 'object' &&
            segment !== null &&
            typeof (segment as any).start === 'string' &&
            typeof (segment as any).end === 'string'
          ) {
            return { start: (segment as any).start, end: (segment as any).end };
          }
          return null;
        })
        .filter((segment): segment is OperatingSegment => segment !== null);
      if (segments.length === 0) {
        return null;
      }
      return {
        day: entry.day,
        segments,
      };
    })
    .filter((item): item is DaySchedule => item !== null);
};

const ensureSocialLinks = (value: unknown): Record<string, string | null> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string | null> = {};
  for (const [key, val] of Object.entries(value)) {
    record[key] = typeof val === 'string' ? val : null;
  }
  return record;
};

type CarouselImage = { imageUrl: string; altText?: string | null };
const isCarouselImage = (value: unknown): value is CarouselImage => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).imageUrl === 'string'
  );
};

type PromoPopup = {
  type: 'lightbox' | 'welcome' | 'modal';
  imageUrl: string;
  link?: string;
  active?: boolean;
};

const isPromoPopup = (value: unknown): value is PromoPopup => {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as any).type !== 'string' ||
    typeof (value as any).imageUrl !== 'string'
  ) {
    return false;
  }
  const type = (value as any).type;
  return type === 'lightbox' || type === 'welcome' || type === 'modal';
};

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async getSettings(): Promise<SystemSettingsResponse> {
    const existing = await this.findOne();
    if (existing) {
      return this.format(existing);
    }
    const created = await this.createDefaultSettings();
    return this.format(created);
  }

  async updateSettings(
    sessionRole: string | string[] | undefined,
    dto: UpdateSystemSettingsDto,
  ): Promise<SystemSettingsResponse> {
    if (!hasMasterRole(sessionRole) && !hasAdminRole(sessionRole)) {
      throw new ForbiddenException(
        'Somente MASTER ou ADMIN podem editar as configuracoes',
      );
    }

    if (dto.maintenanceMode !== undefined && !hasMasterRole(sessionRole)) {
      throw new ForbiddenException(
        'Somente MASTER pode alterar o modo manutenção',
      );
    }

    const existing = await this.ensureSettings();
    const payload: Partial<SystemSettingsRow> = {};

    if (dto.maintenanceMode !== undefined) {
      payload.maintenanceMode = dto.maintenanceMode;
    }
    if (dto.maintenanceMessage !== undefined) {
      payload.maintenanceMessage = dto.maintenanceMessage ?? null;
    }
    if (dto.maintenanceAllowedRoutes) {
      payload.maintenanceAllowedRoutes = dto.maintenanceAllowedRoutes;
    }
    if (dto.operatingHours) {
      payload.operatingHours = dto.operatingHours;
    }

    if (dto.contact) {
      if (dto.contact.address !== undefined) {
        payload.address = dto.contact.address ?? null;
      }
      if (dto.contact.city !== undefined) {
        payload.city = dto.contact.city ?? null;
      }
      if (dto.contact.state !== undefined) {
        payload.state = dto.contact.state ?? null;
      }
      if (dto.contact.zipCode !== undefined) {
        payload.zipCode = dto.contact.zipCode ?? null;
      }
      if (dto.contact.phone !== undefined) {
        payload.phone = dto.contact.phone ?? null;
      }
      if (dto.contact.whatsappLink !== undefined) {
        payload.whatsappLink = dto.contact.whatsappLink ?? null;
      }
    }

    if (dto.socialLinks) {
      payload.socialLinks = dto.socialLinks;
    }

    if (dto.carouselImages) {
      payload.carouselImages = dto.carouselImages.map((image) => ({
        ...image,
        altText: image.altText ?? null,
      }));
    }

    if (dto.promoPopups) {
      payload.promoPopups = dto.promoPopups;
    }

    if (Object.keys(payload).length === 0) {
      return this.format(existing);
    }

    const [updated] = await this.databaseService.database
      .update(systemSettingsTable)
      .set(payload)
      .where(eq(systemSettingsTable.id, existing.id))
      .returning();

    return this.format(updated ?? existing);
  }

  private async findOne(): Promise<SystemSettingsRow | null> {
    const [row] = await this.databaseService.database
      .select()
      .from(systemSettingsTable)
      .limit(1);
    return row ?? null;
  }

  private async createDefaultSettings(): Promise<SystemSettingsRow> {
    const [row] = await this.databaseService.database
      .insert(systemSettingsTable)
      .values({
        maintenanceMode: false,
        maintenanceAllowedRoutes: DEFAULT_MAINTENANCE_ROUTES,
        operatingHours: DEFAULT_OPERATING_HOURS,
        carouselImages: [],
        promoPopups: [],
      })
      .returning();
    return row;
  }

  private async ensureSettings(): Promise<SystemSettingsRow> {
    const existing = await this.findOne();
    if (existing) {
      return existing;
    }
    return this.createDefaultSettings();
  }

  private format(row: SystemSettingsRow): SystemSettingsResponse {
    const maintenanceRoutes =
      ensureStringArray(row.maintenanceAllowedRoutes) ??
      DEFAULT_MAINTENANCE_ROUTES;
    const hours = ensureOperatingHours(row.operatingHours);
    return {
      id: row.id,
      maintenanceMode: row.maintenanceMode,
      maintenanceMessage: row.maintenanceMessage ?? null,
      maintenanceAllowedRoutes:
        maintenanceRoutes.length > 0
          ? maintenanceRoutes
          : DEFAULT_MAINTENANCE_ROUTES,
      operatingHours: hours.length > 0 ? hours : DEFAULT_OPERATING_HOURS,
      contact: {
        address: row.address ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        zipCode: row.zipCode ?? null,
        phone: row.phone ?? null,
        whatsappLink: row.whatsappLink ?? null,
      },
      socialLinks: ensureSocialLinks(row.socialLinks),
      carouselImages: this.normalizeCarouselImages(row.carouselImages),
      promoPopups: this.normalizePromoPopups(row.promoPopups),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private normalizeCarouselImages(value: unknown): CarouselImage[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const images: CarouselImage[] = [];
    for (const entry of value) {
      if (isCarouselImage(entry)) {
        this.assertCloudinaryUrl(entry.imageUrl);
        images.push({
          imageUrl: entry.imageUrl,
          altText: typeof entry.altText === 'string' ? entry.altText : null,
        });
      }
    }
    return images;
  }

  private normalizePromoPopups(value: unknown): PromoPopup[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const popups: PromoPopup[] = [];
    for (const entry of value) {
      if (isPromoPopup(entry)) {
        this.assertCloudinaryUrl(entry.imageUrl);
        popups.push({
          type: entry.type,
          imageUrl: entry.imageUrl,
          link:
            typeof (entry as any).link === 'string'
              ? (entry as any).link
              : undefined,
          active:
            typeof (entry as any).active === 'boolean'
              ? (entry as any).active
              : undefined,
        });
      }
    }
    return popups;
  }

  private assertCloudinaryUrl(url: string) {
    if (!url) {
      throw new BadRequestException('URL da imagem obrigatoria');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('URL invalida');
    }
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    if (!cloudName) {
      throw new ServiceUnavailableException('Cloudinary nao configurado');
    }
    const expectedSegment = `/${cloudName}/`;
    if (parsed.hostname !== 'res.cloudinary.com') {
      throw new BadRequestException('Imagens devem vir do Cloudinary');
    }
    if (!parsed.pathname.includes(expectedSegment)) {
      throw new BadRequestException(
        'Imagens devem pertencer ao cloud name configurado',
      );
    }
  }
}
