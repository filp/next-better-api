import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { createRequest, createResponse } from 'node-mocks-http';
import { asHandler, endpoint } from './index';

export const createTestRouteContext = () => ({
  req: createRequest<NextApiRequest>(),
  res: createResponse<NextApiResponse>(),
});

describe('routing', () => {
  test('creating an endpoint', () => {
    const e = endpoint(
      {
        method: 'get',
      },
      () => ({
        status: 200,
        body: {
          hello: 'world',
        },
      })
    );

    expect(e.method).toEqual('get');
    expect(e.bodySchema).toBeUndefined();
    expect(e.responseSchema).toBeUndefined();
    expect(e.querySchema).toBeUndefined();
  });

  test('creating an endpoint with a promise handler', () => {
    const e = endpoint(
      {
        method: 'post',
      },
      async () => {
        const message = 'hello world';

        return {
          status: 200,
          body: {
            message,
          },
        };
      }
    );

    expect(e.method).toEqual('post');
    expect(e.handler);
  });

  test('creating an endpoint with a context builder', () => {
    const e = endpoint(
      {
        method: 'get',
        context: ({ req }) => ({
          userId: req.query.userId,
        }),
      },
      ({ userId }) => ({
        status: 200,
        body: {
          userId,
        },
      })
    );

    expect(e.context).toBeDefined();
  });

  test('creating an endpoint with a decorator', async () => {
    const mock = jest.fn();

    const dec =
      (innerHandler: NextApiHandler) =>
      async (req: NextApiRequest, res: NextApiResponse) => {
        mock(req, res);

        return innerHandler(req, res);
      };

    const e = endpoint(
      {
        method: 'get',
      },
      () => ({
        status: 200,
        body: {
          message: 'hello',
        },
      })
    );

    const decorated = asHandler([e], {
      decorators: [dec],
    });

    const { req, res } = createTestRouteContext();
    await decorated(req, res);
    expect(mock).toHaveBeenCalledWith(req, res);
  });
});
