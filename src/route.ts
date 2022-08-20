import type { z, ZodError, ZodTypeAny } from 'zod';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { type RouteContext, createRouteContext } from './context';

// BaseBodyType is the base type used for response body: anything that looks like
// a collection (e.g arbitrary JSON)
export type BaseBodyType = Record<string, unknown>;

export type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'head'
  | 'options'
  | 'trace';

type ErrorResponse = {
  error: {
    message: string;
  };
};

type MethodHandlerMap<BodyT = BaseBodyType> = Partial<
  Record<
    HttpMethod,
    {
      handler: ApiRouteHandler<BodyT | ErrorResponse>;
      querySchema?: ZodTypeAny;
      bodySchema?: ZodTypeAny;
    }
  >
>;
type HandlerDecorator = (handler: NextApiHandler) => NextApiHandler;

type HandlerResponse<BodyT> = {
  status?: number;
  redirect?: string;
  body?: BodyT | ErrorResponse;
  headers?: {
    [headerName: string]: string | string[];
  };
};

export type ApiRouteHandler<BodyT> = (
  context: RouteContext
) => Promise<HandlerResponse<BodyT>>;

const setResponseHeaders = (
  res: NextApiResponse,
  headers: HandlerResponse<unknown>['headers']
) => {
  if (headers) {
    Object.entries(headers).forEach(([name, value]) =>
      res.setHeader(name, value)
    );
  }

  return res;
};

export const schemaValidationErrors = (
  handlers: MethodHandlerMap,
  req: NextApiRequest
) => {
  const method = req.method?.toLowerCase() as HttpMethod;
  const querySchema = handlers[method]?.querySchema;
  const bodySchema = handlers[method]?.bodySchema;

  const errorResponse = ({ errors }: ZodError) =>
    JSON.stringify({
      errors,
    });

  if (querySchema) {
    const schemaParse = querySchema?.safeParse(req.query);
    if (!schemaParse?.success) {
      return errorResponse(schemaParse.error);
    }
  }

  if (bodySchema) {
    const schemaParse = bodySchema?.safeParse(req.body);
    if (!schemaParse?.success) {
      return errorResponse(schemaParse.error);
    }
  }
};

// Convenience method for decorating handlers in a consistent manner:
//
//  decorateHandler(myHandler, [withSentry, withFoo, withBar])
//
// Decorators are applied left to right, with the right-most decorator
// returning the outer handler.
const decorateHandler = (
  handler: NextApiHandler,
  decorators: HandlerDecorator[]
) =>
  decorators.reduce(
    (wrappedHandler, decorator) => decorator(wrappedHandler),
    handler
  );

// Wraps the given handler with core instrumentation. This allows API handlers
// not created through the `route` method (such as next-auth's) to benefit from
// instrumentation and other middlewares.
export const instrumentHandler = (handler: NextApiHandler) =>
  decorateHandler(handler, []);

export const routeHandler = (handler: NextApiHandler) =>
  decorateHandler(handler, []);

// Base runtime context type for endpoint handlers:
type EndpointContext<QueryT, RequestBodyT> = RouteContext & {
  query: QueryT;
  body: RequestBodyT;
};

// The outcome of an endpoint handler:
type EndpointResult<ResponseBodyT> = {
  status?: number;
  redirect?: string;
  body?: ResponseBodyT | ErrorResponse;
  headers?: {
    [headerName: string]: string | string[];
  };
};

// Takes a ZodType | undefined union and spits out either an inferred
// type for the schema, or undefined. This allows us to more smoothly
// handle type inference for optional schemas:
type OptionalSchemaType<S> = S extends ZodTypeAny ? z.infer<S> : undefined;

// Shape of an individual endpoint runtime handler:
export type EndpointHandler<QueryT, RequestBodyT, ResponseBodyT> = (
  ctx: EndpointContext<QueryT, RequestBodyT>
) => Promise<EndpointResult<ResponseBodyT>>;

// We use this inferred type to build our additional InferX types without
// having to know the specifics of the `endpoint` method shape:
type EndpointDefinition = ReturnType<typeof endpoint>;

// Allows infering the request body type given an endpoint:
//
// const postContent = endpoint(...)
// type PostContentRequestBodyType = InferRequestBodyType<typeof postContent>
//
export type InferRequestBodyType<T extends EndpointDefinition> = NonNullable<
  OptionalSchemaType<T['bodySchema']>
>;

// Allows infering the response body type given an endpoint:
export type InferResponseBodyType<T extends EndpointDefinition> = NonNullable<
  OptionalSchemaType<T['responseSchema']>
>;

// Allows infering the query type given an endpoint:
export type InferQueryType<T extends EndpointDefinition> = NonNullable<
  OptionalSchemaType<T['querySchema']>
>;

type EndpointOptions<QuerySchemaT, RequestBodySchemaT, ResponseBodySchemaT> = {
  method: HttpMethod;
  responseSchema?: ResponseBodySchemaT;
  bodySchema?: RequestBodySchemaT;
  querySchema?: QuerySchemaT;
};

// Intermediate function for building an endpoint handler. Produces an object that
// can be provided to `route()` to be converted into a single NextApiHandler, e.g:
//
// const postContent = endpoint(...)
// const getContent = endpoint(...)
//
// export default route([postContent, getContent]);
export const endpoint = <
  QuerySchemaT extends ZodTypeAny = ZodTypeAny,
  RequestBodySchemaT extends ZodTypeAny = ZodTypeAny,
  ResponseBodySchemaT extends ZodTypeAny = ZodTypeAny
>(
  options: EndpointOptions<
    QuerySchemaT,
    RequestBodySchemaT,
    ResponseBodySchemaT
  >,
  handler: EndpointHandler<
    OptionalSchemaType<QuerySchemaT>,
    OptionalSchemaType<RequestBodySchemaT>,
    OptionalSchemaType<ResponseBodySchemaT>
  >
) => ({
  ...options,
  handler,
});

export const route = (endpoints: EndpointDefinition[]): NextApiHandler => {
  // Map endpoints to their methods, and throw an error early on to alert
  // developers if somehow two endpoints are matching for the same method:
  const methodEndpoints: Record<string, EndpointDefinition> = endpoints.reduce(
    (endpoints, endpointDef) => {
      const method = (endpointDef.method as string).toLowerCase();

      if (typeof endpoints[method] !== 'undefined') {
        throw new Error(`Duplicate endpoint definition for ${method}`);
      }

      return {
        ...endpoints,
        [method]: endpointDef,
      };
    },
    {} as Record<string, EndpointDefinition>
  );

  const outerHandler: NextApiHandler = async (req, res) => {
    try {
      const context = createRouteContext({ req, res });
      const method = req.method?.toLowerCase() as HttpMethod;
      const endpointDef = methodEndpoints[method];

      // If no endpoint definition exists for this method, 404 early on:
      if (!endpointDef) {
        res.status(404).end();
        return;
      }

      const { handler } = endpointDef;

      const schemaValidationErrors = validateEndpointSchemaForRequest(
        endpointDef,
        req
      );

      if (schemaValidationErrors) {
        res.status(400).end(schemaValidationErrors);
        return;
      }

      type LocalEndpointContext = EndpointContext<
        OptionalSchemaType<typeof endpointDef.querySchema>,
        OptionalSchemaType<typeof endpointDef.bodySchema>
      >;

      const { status, redirect, body, headers } = await handler({
        ...context,
        query: req.query,
        body: req.body,
      } as LocalEndpointContext);

      setResponseHeaders(res, headers);

      if (redirect) {
        res.redirect(status || 307, redirect);
      } else {
        res.status(status || 200).send(body);
      }
    } catch (error) {
      res.status(500).end();
      throw error;
    }
  };

  return routeHandler(outerHandler);
};

export const validateEndpointSchemaForRequest = (
  endpointDef: EndpointDefinition,
  req: NextApiRequest
) => {
  const querySchema = endpointDef.querySchema;
  const bodySchema = endpointDef.bodySchema;

  const errorResponse = ({ errors }: ZodError) =>
    JSON.stringify({
      errors,
    });

  if (querySchema) {
    const schemaParse = querySchema?.safeParse(req.query);
    if (!schemaParse?.success) {
      return errorResponse(schemaParse.error);
    }
  }

  if (bodySchema) {
    const schemaParse = bodySchema?.safeParse(req.body);
    if (!schemaParse?.success) {
      return errorResponse(schemaParse.error);
    }
  }
};
