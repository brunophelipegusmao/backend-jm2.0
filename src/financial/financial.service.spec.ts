import { Test, TestingModule } from '@nestjs/testing';
import { FinancialService } from './financial.service';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';

describe('FinancialService', () => {
  let service: FinancialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialService,
        {
          provide: DatabaseService,
          useValue: { database: {} },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<FinancialService>(FinancialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
