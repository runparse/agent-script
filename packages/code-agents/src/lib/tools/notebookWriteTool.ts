import { BaseTool } from './baseTool';
import { IMultiStepAgent } from '../types';
import { Type, TObject, Static, TArray, TNumber } from '@sinclair/typebox';
import { TObjectWrapper } from '../jsonSchema';
export class NotebookWriteTool extends BaseTool<
  TArray<TObject<any>>,
  TObject<{ successCount: TNumber; errorCount: TNumber }>
> {
  name = 'notebookWrite';

  description = 'Write data entries to the notebook';

  inputSchema: TArray<TObject<any>>;

  outputSchema = Type.Object(
    {
      successCount: Type.Number(),
      errorCount: Type.Number(),
    },
    { default: { successCount: 0, errorCount: 0 } }
  );

  entries: Array<any> = [];

  constructor(
    public dataObjectSchema: TObjectWrapper = new TObjectWrapper(
      Type.Object({})
    )
  ) {
    super();
    this.inputSchema = Type.Array(
      this.dataObjectSchema.tSchema as TObject<any>
    );
    this.inputSchema.default = [this.dataObjectSchema.jsonSchemaInstance];
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IMultiStepAgent
  ): Promise<Static<typeof this.outputSchema>> {
    this.entries.push(...input);

    return {
      successCount: input.length,
      errorCount: 0,
    };
  }
}
