import { Type, Static, TSchema } from '@sinclair/typebox';
import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';

export class CallAgentUdf extends BaseUdf {
  name: string;
  description: string;

  inputSchema = Type.Object({
    task: Type.String({
      description: 'The task to be performed by the agent',
    }),
  });
  outputSchema: TSchema;

  agentName: string;

  constructor({
    agentName,
    agentDescription,
    agentOutputSchema,
  }: {
    agentName: string;
    agentDescription: string;
    agentOutputSchema?: TSchema;
  }) {
    super();
    this.name = `call${agentName
      .split(/\s+/g)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join('')}`;
    this.description = `Call the ${agentName} agent for help. Here's a description of the agent: ${agentDescription}`;
    this.agentName = agentName;
    this.outputSchema = agentOutputSchema || Type.Any();
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const managedAgent = agent.managedAgents.find(
      (a) => a.name === this.agentName,
    );
    if (!managedAgent) {
      throw new Error(`Agent ${this.name} not found`);
    }
    const result = await managedAgent.call(input.task, {});
    return result;
  }
}
