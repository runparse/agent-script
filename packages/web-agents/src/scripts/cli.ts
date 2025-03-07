#!/usr/bin/env node
import {
  ChatModel,
  CodeAgent,
  codeAgentPrompt,
  DuckduckgoSearchTool,
  NotebookWriteTool,
  TObjectWrapper,
} from '@runparse/code-agents';
import { setup } from '@runparse/code-agents-instrumentation';
import { Option, program } from 'commander';
import playwright from 'playwright';
import { PageExtractDataTool, PageQueryAgent } from '../lib/pageQueryAgent';
import { ParticleAgent } from '../lib/particleAgent';

setup({ omitImageData: false });

program
  .command('code-agent')
  .description('Run the code agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory()
  )
  .action(async (options) => {
    const agent = new CodeAgent({
      task: options.task,
      name: 'test',
      description: 'test',
      tools: [new DuckduckgoSearchTool()],
      prompts: codeAgentPrompt,
      maxSteps: 5,
    });

    const result = await agent.run(
      `${options.task}
Make sure to include code with the correct pattern, for instance:
Thoughts: Your thoughts
Code:
\`\`\`js
// Your javascript code here
\`\`\`<end_code>
Make sure to provide correct code blobs.`,
      {}
    );

    console.log(JSON.stringify(result, undefined, 2));
  });

program
  .command('page-query-agent')
  .description('Run the page query agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory()
  )
  .addOption(
    new Option('--instructions <instructions>', 'Query instructions').default(
      'test'
    )
  )
  .addOption(
    new Option(
      '--schema <schema>',
      'JSON schema for the output'
    ).makeOptionMandatory()
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    const browser = await playwright.chromium.launch({
      headless: false,
      args: [
        '--window-size=1024,1024',
        '--window-position=0,0',
        '--force-device-scale-factor=1',
        '--disable-pdf-viewer',
      ],
    });
    const page = await browser.newPage();
    const jsonSchema = TObjectWrapper.fromJsonSchemaInstance(
      JSON.parse(options.schema)
    );

    const agent = new PageQueryAgent({
      task: options.task,
      name: 'test',
      description: 'test',
      prompts: codeAgentPrompt,
      maxSteps: 3,
      page: page,
      instructions: options.instructions,
      dataObjectSchema: jsonSchema,
      tools: {
        otherTools: [],
        pageExtractDataTool: new PageExtractDataTool({
          model: new ChatModel({
            provider: 'openai',
            model: 'gpt-4o-mini',
          }),
          dataObjectSchema: TObjectWrapper.fromJsonSchemaInstance([
            jsonSchema.jsonSchemaInstance!,
          ]),
        }),
        notebookWriteTool: new NotebookWriteTool(),
      },
    });

    const result = await agent.run(
      `${options.task}
Make sure to include code with the correct pattern, for instance:
Thoughts: Your thoughts
Code:
\`\`\`js
// Your javascript code here
\`\`\`<end_code>
Make sure to provide correct code blobs.`,
      {}
    );

    console.log(JSON.stringify(result, undefined, 2));
    await browser.close();
  });

program
  .command('particle-agent')
  .description('Run the page query agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory()
  )
  .addOption(
    new Option('--instructions <instructions>', 'Query instructions').default(
      'test'
    )
  )
  .addOption(
    new Option(
      '--schema <schema>',
      'JSON schema for the output'
    ).makeOptionMandatory()
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    const browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage();
    const jsonSchema = TObjectWrapper.fromJsonSchemaInstance(
      JSON.parse(options.schema)
    );
    const agent = new ParticleAgent({
      task: options.task,
      name: 'test',
      description: 'test',
      prompts: codeAgentPrompt,
      maxSteps: 10,
      page: page,
      instructions: options.instructions,
      dataObjectSchema: jsonSchema,
      tools: {
        otherTools: [],
        pageExtractDataTool: new PageExtractDataTool({
          model: new ChatModel({
            provider: 'openai',
            model: 'gpt-4o-mini',
          }),
          dataObjectSchema: TObjectWrapper.fromJsonSchemaInstance([
            jsonSchema.jsonSchemaInstance!,
          ]),
        }),
        notebookWriteTool: new NotebookWriteTool(),
      },
    });

    const result = await agent.run(
      `${options.task}
Make sure to include code with the correct pattern, for instance:
Thoughts: Your thoughts
Code:
\`\`\`js
// Your javascript code here
\`\`\`<end_code>
Make sure to provide correct code blobs.`,
      {}
    );

    console.log(JSON.stringify(result, undefined, 2));
    await browser.close();
  });

program.parse(process.argv);
