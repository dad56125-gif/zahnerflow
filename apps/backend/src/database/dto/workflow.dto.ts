import { WorkflowStatus } from '../entities';

export class CreateWorkflowDto {
  name: string;
  description?: string;
  definition: {
    nodes: any[];
    edges: any[];
    config: Record<string, any>;
    parameters: Record<string, any>;
  };
  status?: WorkflowStatus;
  metadata?: {
    tags: string[];
    category?: string;
    version?: string;
    author?: string;
  };
}

export class UpdateWorkflowDto {
  name?: string;
  description?: string;
  definition?: {
    nodes: any[];
    edges: any[];
    config: Record<string, any>;
    parameters: Record<string, any>;
  };
  status?: WorkflowStatus;
  metadata?: {
    tags: string[];
    category?: string;
    version?: string;
    author?: string;
  };
}

export class CreateWorkflowVersionDto {
  workflowId: string;
  version: string;
  changelog?: string;
  definition: any;
}