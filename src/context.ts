import type { NextApiRequest, NextApiResponse } from 'next';

export type RouteContext = {
  req: NextApiRequest;
  res: NextApiResponse;
};

export const createRouteContext = (baseContext: RouteContext) => ({
  ...baseContext,
});

export type BasicRouteContext = ReturnType<typeof createRouteContext>;
