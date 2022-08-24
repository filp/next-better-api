# API Reference

## `endpoint`

The `endpoint` method can be used to define your API endpoints. Endpoints created with this method
are intermediate representations that can then be converted to valid NextJS API handlers, and maintain
compatibility with NextJS and third-party libraries.

```ts
const myEndpoint = endpoint({
  // The HTTP method for this endpoint
  method: 'get', // post, delete, put, patch, etc

  // The Zod schema for the request's `query` -- in NextJS terms, this includes
  // both URL params as well as query string params.
  //
  // In the below example, two query arguments are accepted:
  //
  // a string 'id' parameter
  // a string 'sortOrder' parameter, which is an optional enum of either `asc` or `desc`
  //
  // The endpoint handler function can use `query` in the context object to access a
  // type-annotated, validated/normalised version of the requests' query object.
  querySchema: z.object({
    id: z.string(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),

  // The Zod schema for the request's body, available as `body` in your endpoint's context.
  //
  // Similar to the above, `body` is type-annotated, validated and normalised by Zod before
  // being passed into your endpoint function.
  //
  // You can use Zod's `.strict` modifier to trigger a validation error if the caller includes
  // unexpected properties in the request's body.
  bodySchema: z
    .object({
      name: z.string(),
      description: z.string().min(3).max(256),
    })
    .strict(),

  // The Zod schema for the handler's response.
  //
  // If provided, this schema provides type annotation for your endpoint's response body:
  //
  //  return {
  //    status: 201,
  //    body: {
  //      // Typescript will provide annotations (and errors) for this response object:
  //      product: {
  //        id: 'xyz',
  //        name: 'Cool Mask',
  //        description: 'A cool mask, neat.'
  //      }
  //    }
  //  };
  //
  // Additionally, `next-better-api` can also be configured to throw an error at runtime
  // if your endpoint does not return a valid response (for example, in development mode).
  responseSchema: z
    .object({
      product: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
      }),
    })
    .strict(),

  // The context property can be set to a function that takes the base context (with access to
  // the `req` and `res` objects - for Request and Response), and return an object that will be
  // merged with the context object provided to the endpoint function:
  //
  // endpoint({
  //   method: 'get',
  //   context: (baseContext) => ({  foo: 'bar' })
  // }, ({ foo } => console.log(foo) /* bar */ ))
  //
  context: (baseContext) => {
    return {
      authToken: baseContext.req.headers['x-auth-token'],
    };
  },
});
```

## `asHandler`

The `asHandler` method converts the intermediate representations created by `endpoint` to
valid NextJS API Handlers (`NextApiHandler`). Following NextJS convention, the output of
this method should be your default export for each API endpoint file:

```ts
// pages/api/my-api-endpoint.ts
export default asHandler([
  endpoint({ method: 'get' } /* ... */),
  endpoint({ method: 'post' } /* ... */),
  endpoint({ method: 'delete' } /* ... */),
]);
```

Because the return value of `asHandler` is a standard API handler, you can also use it with
third-party libraries that wrap handlers to add additional behavior, our easily create your own.

For example, [the official Sentry integration for NextJS](https://docs.sentry.io/platforms/javascript/guides/nextjs/) provides a `withSentry` method that can
be used with `next-better-api`:

```ts
export default withSentry(
  asHandler([
    /* ... */
  ])
);
```

`asHandler` also accepts an options object with `decorators`, which may be a better way to achieve
the same results, depending on your needs - decorators are applied left-to-right, meaning in the below
example where you may want to 'install' sentry early in your request stack, you'll want it to be one
of the first decorators on the array.

```ts
export default asHandler(
  [
    /* ... */
  ],
  {
    decorators: [withSentry],
  }
);
```

You can define custom handlers easily, as a function that accepts a `NextApiHandler`, and also returns
a `NextApiHandler`:

```ts
const withMyCustomBehaviour =
  (innerHandler: NextApiHandler) =>
  async (req: NextApiRequest, res: NextApiRequest) => {
    if (req.headers['some-header'] === 'uh oh') {
      return res.status(500).json({ message: 'broked' });
    }

    return innerHandler(req, res);
  };

export default asHandler(
  [
    /* ... */
  ],
  { decorators: [withMyCustomBehaviour] }
);
```

## `InferEndpointType`

This convenience type can be used to get type information for a given endpoint, based on its schema.

```ts
const myEndpoint = endpoint({
  method: 'get',
  querySchema: /* ... */,
  bodySchema: /* ... */
}, () => {});


type MyEndpointType = InferEndpointType<typeof myEndpoint>;
  // #=> {
  //   Body: { },
  //   Query: { },
  //   Response: { }
  // }

// Get the request body type, for example, to annotate a `fetch` call:
type MyEndpointBodyType = InferEndpointType<typeof myEndpoint>['Body'];
```

Individual versions of these type helpers are also available:

```ts
InferQueryType<typeof myEndpoint>;
InferRequestBodyType<typeof myEndpoint>;
InferResponseBodyType<typeof myEndpoint>;
```
