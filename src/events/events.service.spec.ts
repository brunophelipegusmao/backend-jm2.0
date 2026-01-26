import { EventsService } from './events.service';

const makeService = (database: any, auditLog = jest.fn()) => {
  const databaseService = { database };
  const auditService = { log: auditLog };
  const cloudinaryService = { uploadImage: jest.fn(), deleteImage: jest.fn() };
  return new EventsService(
    databaseService as any,
    auditService as any,
    cloudinaryService as any,
  );
};

describe('EventsService', () => {
  it('generates slug with suffix on conflict', async () => {
    let insertCalls = 0;
    const database = {
      transaction: jest.fn(async (callback: any) => {
        const tx = {
          insert: jest.fn(() => ({
            values: jest.fn((values: any) => ({
              returning: jest.fn(async () => {
                insertCalls += 1;
                if (insertCalls === 1) {
                  const error: any = new Error('duplicate');
                  error.code = '23505';
                  error.constraint = 'tb_events_slug_unique';
                  throw error;
                }
                return [
                  {
                    id: 'event-1',
                    createdByUserId: values.createdByUserId,
                    accessMode: values.accessMode,
                    capacity: values.capacity,
                    ...values,
                  },
                ];
              }),
            })),
          })),
        };
        return callback(tx);
      }),
    };

    const service = makeService(database);
    const result = await service.create(
      {
        title: 'Evento Teste',
        description: 'Descricao',
        date: '2025-01-01',
        time: '09:00',
        accessMode: 'open',
      },
      'user-1',
    );

    expect(result.slug).toBe('evento-teste-2');
  });

  it('rejects registration for open events', async () => {
    const event = {
      id: 'event-1',
      slug: 'evento-aberto',
      accessMode: 'open',
      isPublished: true,
      deletedAt: null,
      createdByUserId: 'user-1',
    };
    const database = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [event]),
          })),
        })),
      })),
    };
    const service = makeService(database);

    await expect(
      service.registerPublic('evento-aberto', { email: 'aluno@teste.com' }),
    ).rejects.toThrow('Evento aberto, nao requer inscricao');
  });

  it('waitlists when capacity is full', async () => {
    const event = {
      id: 'event-1',
      slug: 'evento-fechado',
      accessMode: 'registered_only',
      isPublished: true,
      capacity: 1,
      deletedAt: null,
      createdByUserId: 'user-1',
    };
    const database = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [event]),
          })),
        })),
      })),
      transaction: jest.fn(async (callback: any) => {
        const tx = {
          select: jest.fn((selection: any) => ({
            from: jest.fn(() => ({
              where: jest.fn(() => {
                if (
                  selection &&
                  typeof selection === 'object' &&
                  'total' in selection
                ) {
                  return Promise.resolve([{ total: 1 }]);
                }
                return {
                  limit: jest.fn(async () => []),
                };
              }),
            })),
          })),
          insert: jest.fn(() => ({
            values: jest.fn((values: any) => ({
              returning: jest.fn(async () => [
                {
                  id: 'reg-1',
                  ...values,
                },
              ]),
            })),
          })),
        };
        return callback(tx);
      }),
    };
    const service = makeService(database);

    const registration = await service.registerPublic('evento-fechado', {
      email: 'aluno@teste.com',
      name: 'Aluno Teste',
    });

    expect(registration.status).toBe('waitlisted');
  });

  it('promotes waitlist on cancel', async () => {
    const event = {
      id: 'event-1',
      accessMode: 'registered_only',
      capacity: 1,
      createdByUserId: 'user-1',
      deletedAt: null,
    };
    const registration = {
      id: 'reg-1',
      eventId: 'event-1',
      status: 'confirmed',
      deletedAt: null,
    };
    const cancelled = {
      ...registration,
      status: 'cancelled',
      cancelledAt: new Date(),
    };
    const waitlisted = {
      id: 'reg-2',
      eventId: 'event-1',
      status: 'waitlisted',
      deletedAt: null,
    };
    const promoted = {
      ...waitlisted,
      status: 'confirmed',
      confirmedAt: new Date(),
    };

    let selectCalls = 0;
    let updateCalls = 0;
    const database = {
      transaction: jest.fn(async (callback: any) => {
        const tx = {
          select: jest.fn(() => ({
            from: jest.fn(() => ({
              where: jest.fn(() => {
                selectCalls += 1;
                if (selectCalls === 1) {
                  return {
                    limit: jest.fn(async () => [event]),
                  };
                }
                if (selectCalls === 2) {
                  return {
                    limit: jest.fn(async () => [registration]),
                  };
                }
                return {
                  orderBy: jest.fn(() => ({
                    limit: jest.fn(async () => [waitlisted]),
                  })),
                };
              }),
            })),
          })),
          update: jest.fn(() => ({
            set: jest.fn(() => ({
              where: jest.fn(() => ({
                returning: jest.fn(async () => {
                  updateCalls += 1;
                  return updateCalls === 1 ? [cancelled] : [promoted];
                }),
              })),
            })),
          })),
        };
        return callback(tx);
      }),
    };
    const service = makeService(database);

    const result = await service.cancelRegistration('event-1', 'reg-1', {
      actorUserId: 'admin-1',
    });

    expect(result.promoted?.status).toBe('confirmed');
  });
});
