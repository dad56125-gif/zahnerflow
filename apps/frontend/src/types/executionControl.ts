export interface RunFlowOptions {
  startFromUnrolledIndex?: number;
}

export type RunFlowOutcome =
  | 'started'
  | 'confirmation-required'
  | 'blocked'
  | 'failed';

export type RunFlowHandler = (options?: RunFlowOptions) => Promise<RunFlowOutcome>;
