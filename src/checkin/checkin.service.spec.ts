import { Test, TestingModule } from '@nestjs/testing';
import { CheckinService } from './checkin.service';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { AnonymousCheckinRateLimiter } from './anonymous-checkin-rate-limiter';

describe('CheckinService', () => {
  let service: CheckinService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: DatabaseService, useValue: { database: {} } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: AnonymousCheckinRateLimiter, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
