import { endpoint } from './route';

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
});
