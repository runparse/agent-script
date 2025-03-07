import { TSchema, TString } from '@sinclair/typebox';
import {
  PageQueryAgent,
  IPageQueryAgent,
  IPageQueryAgentProps,
} from './pageQueryAgent/pageQueryAgent';
import { BingSearchTool } from '@runparse/code-agents';
export interface IParticleAgent<TOutSchema extends TSchema = TString>
  extends IPageQueryAgent<TOutSchema> {}

export interface IParticleAgentProps<TOutSchema extends TSchema>
  extends IPageQueryAgentProps<TOutSchema> {}

export class ParticleAgent
  extends PageQueryAgent
  implements IParticleAgent<TString>
{
  constructor(props: IParticleAgentProps<TString>) {
    super({
      ...props,
      description: `You object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
        props.dataObjectSchema.jsonSchemaInstance
      )} using the 'notebookWrite' tool whenever you find relevant data after extracting data from a webpage or searching the web. You must call the 'notebookWrite' at least once before the using the 'finalAnswer' tool if any data is found. You can close popups, load more data, and extract data following user instructions on a webpage. Always use the 'pageExtractData' tool before using the 'pageLoadMoreData' tool. Use the 'pageLoadMoreData' tool for a maximum of 3 times. If there are no relevant data on the page, write an explanation and any relevant information you can find.`,
    });
    this.tools.push(new BingSearchTool());
  }
}
