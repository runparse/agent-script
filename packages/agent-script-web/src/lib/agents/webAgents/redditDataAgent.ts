import {
  AnalyzeListUdf,
  BraveSearchUdf,
  ChatModel,
  CodeAgent,
  FinalAnswerUdf,
  ICodeAgent,
  ICodeAgentProps,
  PartialBy,
  SaveDataUdf,
  ThinkUdf,
} from '@runparse/agent-script';
// import { RedditGetRelatedDiscussionsUdf } from '../../udf/reddit';
import { RedditGetDiscussionsUdf } from '../../udf/reddit';
export const getRedditAgentDefaultUdfs = () => [
  // new RedditGetRelatedDiscussionsUdf(),
  new RedditGetDiscussionsUdf(),
  new BraveSearchUdf(),
  new SaveDataUdf(),
  new AnalyzeListUdf(),
  new FinalAnswerUdf(),
  new ThinkUdf(),
];

export interface IRedditDataAgentProps
  extends PartialBy<ICodeAgentProps, 'udfs' | 'description' | 'model'> {}

export class RedditDataAgent extends CodeAgent implements ICodeAgent {
  constructor(props: IRedditDataAgentProps) {
    super({
      ...props,
      udfs: props.udfs || getRedditAgentDefaultUdfs(),
      description:
        props.description ||
        `Get relevant data from Reddit. Your general approach is to search for related posts, then follow the user instructions to analyze the posts and comments.`,
      model:
        props.model ||
        new ChatModel({
          provider: 'openai',
          model: 'gpt-4o',
        }),
    });
  }

  override async call(task: string): Promise<{
    success: boolean;
    files: { filename: string; description: string }[];
  }> {
    await super.call(task, {});

    return {
      success: true,
      files: this.udfs.find((udf) => udf instanceof SaveDataUdf)?.files || [],
    };
  }
}
