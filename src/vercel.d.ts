declare module "@vercel/node" {
  export interface NowRequest extends Express.Request {}
  export interface NowResponse extends Express.Response {}
  export type VercelApiHandler = (
    req: NowRequest,
    res: NowResponse
  ) => void | Promise<void>;
} 