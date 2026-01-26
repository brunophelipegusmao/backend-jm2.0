import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { DatabaseService } from '../db/database.service';

describe('PlansService', () => {
  let service: PlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: DatabaseService,
          useValue: { database: {} },
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
