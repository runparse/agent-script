#!/usr/bin/env node
import { setup } from '@runparse/agent-script-instrumentation';
import { Option, program } from 'commander';
import playwright from 'playwright';
import { WebAgent } from '../lib/agents/webAgent/index';
import { createTSchemaFromInstance } from '../lib/utils/schema';
import { ChatModel, CodeAgent, FinalAnswerUdf } from '@runparse/agent-script';
setup();

program
  .command('web-agent')
  .description('Run the web agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory(),
  )
  .addOption(
    new Option('--instructions <instructions>', 'Query instructions').default(
      'test',
    ),
  )
  .addOption(
    new Option(
      '--schema <schema>',
      'JSON schema for the output',
    ).makeOptionMandatory(),
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    const browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage();
    const schema = createTSchemaFromInstance(JSON.parse(options.schema));

    try {
      const agent = new WebAgent({
        task: options.task,
        name: 'Web Agent',
        description: '',
        maxSteps: 10,
        page: page,
        instructions: options.instructions,
        dataObjectSchema: schema,
        shouldRunPlanning: true,
        model: new ChatModel({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 4096,
        }),
      });
      // setTimeout(() => {
      //   agent.updateShouldRunPlanning(true);
      // }, 1000);

      const result = await agent.run(options.task, {});

      console.log(JSON.stringify(result, undefined, 2));
    } catch (error) {
      console.error(error);
    }
    await browser.close();
  });

program
  .command('code-agent-manager')
  .description('Run the code agent manager')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory(),
  )
  .addOption(
    new Option('--instructions <instructions>', 'Query instructions').default(
      'test',
    ),
  )
  .addOption(
    new Option(
      '--schema <schema>',
      'JSON schema for the output',
    ).makeOptionMandatory(),
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    const browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage();
    const schema = createTSchemaFromInstance(JSON.parse(options.schema));

    try {
      const webAgent = new WebAgent({
        task: options.task,
        name: 'Web Agent',
        description: '',
        maxSteps: 10,
        page: page,
        instructions: options.instructions,
        dataObjectSchema: schema,
        shouldRunPlanning: false,
      });

      const agent = new CodeAgent({
        task: options.task,
        name: 'Test Code Agent',
        description: '',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        shouldRunPlanning: true,
        managedAgents: [webAgent],
      });
      // setTimeout(() => {
      //   agent.updateShouldRunPlanning(true);
      // }, 1000);

      const result = await agent.run(options.task, {});

      console.log(JSON.stringify(result, undefined, 2));
    } catch (error) {
      console.error(error);
    }
    await browser.close();
  });

program.parse(process.argv);
