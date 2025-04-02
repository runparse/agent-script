#!/usr/bin/env node
import { setup } from '@runparse/agent-script-instrumentation';
import { Option, program } from 'commander';
import playwright from 'playwright';
import { WebDataAgent, DeepResearchAgent } from '../lib/agents/webAgents/index';
import { createTSchemaFromInstance } from '../lib/utils/schema';
import {
  CodeAgent,
  FinalAnswerUdf,
  NotebookWriteUdf,
} from '@runparse/agent-script';
import { RedditDataAgent } from '../lib/agents/webAgents/redditDataAgent';

setup();

program
  .command('deep-research-agent')
  .description('Run the deep research agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory(),
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    const browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
      const agent = new DeepResearchAgent({
        name: 'Deep Research Agent',
        description: '',
        maxSteps: 10,
        page: page,
        // model: new ChatModel({
        //   provider: 'anthropic',
        //   model: 'claude-3-5-sonnet-latest',
        //   max_tokens: 4096,
        // }),
      });

      const result = await agent.run(options.task);

      console.log(JSON.stringify(result, undefined, 2));
    } catch (error) {
      console.error(error);
    }
    await browser.close();
  });

program
  .command('reddit-data-agent')
  .description('Run the reddit agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory(),
  )
  .action(async (options) => {
    console.log(JSON.stringify(options, undefined, 2));

    try {
      const agent = new RedditDataAgent({
        name: 'Reddit Data Agent',
        maxSteps: 10,
      });

      const result = await agent.run(options.task);
      console.log(
        agent.udfs
          .find((udf) => udf instanceof NotebookWriteUdf)
          ?.content.toString(),
      );

      console.log(JSON.stringify(result, undefined, 2));
    } catch (error) {
      console.error(error);
    }
  });

program
  .command('web-data-agent')
  .description('Run the web agent')
  .addOption(
    new Option('--task <task>', 'The task to run').makeOptionMandatory(),
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
      const agent = new WebDataAgent({
        name: 'Web Agent',
        description: '',
        maxSteps: 10,
        page: page,
        dataObjectSchema: schema,
        shouldRunPlanning: true,
        // model: new ChatModel({
        //   provider: 'anthropic',
        //   model: 'claude-3-5-sonnet-latest',
        //   max_tokens: 4096,
        // }),
      });

      const result = await agent.run(options.task);

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
      const webDataAgent = new WebDataAgent({
        name: 'Web Agent',
        description: '',
        maxSteps: 10,
        page: page,
        dataObjectSchema: schema,
        shouldRunPlanning: false,
      });

      const agent = new CodeAgent({
        name: 'Test Code Agent',
        description: '',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        shouldRunPlanning: true,
        managedAgents: [webDataAgent],
      });

      const result = await agent.run(options.task);

      console.log(JSON.stringify(result, undefined, 2));
    } catch (error) {
      console.error(error);
    }
    await browser.close();
  });

program.parse(process.argv);
