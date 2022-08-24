import type { z, ZodError, ZodTypeAny } from 'zod';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { type RouteContext, createRouteContext } from './context';

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

type MaybePromise<T> = T | Promise<T>;

// A response body that looks JSON-y, used as the default type:
type BaseBodyType = Record<string, unknown>;

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

type Decorator = (handler: NextApiHandler) => NextApiHandler;

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
) => MaybePromise<HandlerResponse<BodyT>>;

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
const decorateHandler = (handler: NextApiHandler, decorators: Decorator[]) =>
  decorators.reduce(
    (wrappedHandler, decorator) => decorator(wrappedHandler),
    handler
  );

type EndpointContext<QueryT, RequestBodyT, ContexT> = RouteContext & {
  query: QueryT;
  body: RequestBodyT;
} & ContexT;

type EndpointResult<ResponseBodyT> = {
  status?: number;
  redirect?: string;
  body?: ResponseBodyT | ErrorResponse;
  headers?: {
    [headerName: string]: string | string[];
  };
};

// Shape of an individual endpoint runtime handler:
export type EndpointHandler<QueryT, RequestBodyT, ResponseBodyT, ContextT> = (
  ctx: EndpointContext<QueryT, RequestBodyT, ContextT>
) => MaybePromise<EndpointResult<ResponseBodyT>>;

// Takes a ZodType | undefined union and spits out either an inferred
// type for the schema, or undefined. This allows us to more smoothly
// handle type inference for optional schemas:
type OptionalSchemaType<S> = S extends ZodTypeAny ? z.infer<S> : undefined;
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

export type InferEndpointType<T extends EndpointDefinition> = NonNullable<{
  Query: InferQueryType<T>;
  Body: InferRequestBodyType<T>;
  Response: InferResponseBodyType<T>;
}>;

const validateEndpointSchemaForRequest = (
  endpointDef: EndpointDefinition,
  req: NextApiRequest
) => {
  const { querySchema, bodySchema } = endpointDef;

  const errorResponse = ({ errors }: ZodError) =>
    JSON.stringify({
      errors,
    });

  if (querySchema) {
    const querySchemaParse = querySchema?.safeParse(req.query);
    if (!querySchemaParse?.success) {
      return errorResponse(querySchemaParse.error);
    }
  }

  if (bodySchema) {
    const bodySchemaParse = bodySchema?.safeParse(req.body);
    if (!bodySchemaParse?.success) {
      return errorResponse(bodySchemaParse.error);
    }
  }
};

type EndpointOptions<
  QuerySchemaT,
  RequestBodySchemaT,
  ResponseBodySchemaT,
  ContextT
> = {
  method: HttpMethod;
  responseSchema?: ResponseBodySchemaT;
  bodySchema?: RequestBodySchemaT;
  querySchema?: QuerySchemaT;
  context?: (routeContext: RouteContext) => MaybePromise<ContextT>;
};

export const endpoint = <
  QuerySchemaT extends ZodTypeAny = ZodTypeAny,
  RequestBodySchemaT extends ZodTypeAny = ZodTypeAny,
  ResponseBodySchemaT extends ZodTypeAny = ZodTypeAny,
  ContextT extends Record<string, unknown> = Record<string, unknown>
>(
  options: EndpointOptions<
    QuerySchemaT,
    RequestBodySchemaT,
    ResponseBodySchemaT,
    ContextT
  >,
  handler: EndpointHandler<
    OptionalSchemaType<QuerySchemaT>,
    OptionalSchemaType<RequestBodySchemaT>,
    OptionalSchemaType<ResponseBodySchemaT>,
    ContextT
  >
) => ({
  ...options,
  handler,
});

type AsHandlerOptions = {
  decorators?: Decorator[];
};

// 'converts' a list of endpoints to a single NextJS API handler.
export const asHandler = (
  endpoints: EndpointDefinition[],
  options: AsHandlerOptions = {}
): NextApiHandler => {
  const { decorators } = options;

  // Map endpoints to their methods:
  // Throws early if there's duplicate endpoints for the same method.
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
      const routeContext = createRouteContext({ req, res });
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

      const endpointContext = endpointDef.context
        ? await endpointDef.context(routeContext)
        : {};

      type LocalEndpointContext = EndpointContext<
        OptionalSchemaType<typeof endpointDef.querySchema>,
        OptionalSchemaType<typeof endpointDef.bodySchema>,
        RouteContext
      >;

      const { status, redirect, body, headers } = await handler({
        ...routeContext,
        ...endpointContext,
        query: req.query,
        body: req.body,
      } as LocalEndpointContext);

      if (body && endpointDef.responseSchema) {
        const responseSchemaParse = endpointDef.responseSchema.safeParse(body);

        // TODO: Handle response schema errors differently:
        // - Allow configuring throw rule through options
        // - Default to throwing in development only, warning otherwise
        if (!responseSchemaParse.success) {
          throw responseSchemaParse.error;
        }
      }

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

  return decorateHandler(outerHandler, decorators || []);
};
