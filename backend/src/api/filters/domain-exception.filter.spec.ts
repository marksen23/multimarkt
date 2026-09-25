import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { DomainExceptionFilter } from './domain-exception.filter';
import { InvalidStateTransitionException } from '../../domain/errors/state-transition.errors';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('DomainExceptionFilter', () => {
  it('passes a domain exception body through unchanged (already has error_code)', () => {
    const filter = new DomainExceptionFilter();
    const { host, json, status } = makeHost();

    filter.catch(new InvalidStateTransitionException('bad transition', { itemId: 'x' }), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0]).toMatchObject({ error_code: expect.any(String), message: 'bad transition' });
  });

  it('normalizes a plain NestJS NotFoundException to the documented envelope', () => {
    const filter = new DomainExceptionFilter();
    const { host, json, status } = makeHost();

    filter.catch(new NotFoundException('Item x not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error_code: 'ERR_NOT_FOUND',
      message: 'Item x not found',
      details: {},
    });
  });

  it('maps a bare TypeORM EntityNotFoundError to 404 instead of leaking to the default handler', () => {
    const filter = new DomainExceptionFilter();
    const { host, json, status } = makeHost();

    filter.catch(new EntityNotFoundError('ItemEntity', { id: 'missing' }), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error_code: 'ERR_NOT_FOUND',
      message: 'The requested resource was not found.',
      details: {},
    });
  });

  it('maps a completely unexpected error to a well-formed 500 instead of an unstructured crash', () => {
    const filter = new DomainExceptionFilter();
    const { host, json, status } = makeHost();

    filter.catch(new Error('something unrelated broke'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error_code: 'ERR_UNKNOWN',
      message: 'An unexpected error occurred.',
      details: {},
    });
  });
});
