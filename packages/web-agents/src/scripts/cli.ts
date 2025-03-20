#!/usr/bin/env node
import { setup } from '@runparse/code-agents-instrumentation';
import { Option, program } from 'commander';
import playwright from 'playwright';
import { ParticleAgent } from '../lib/agents/particleAgent';
import { createTSchemaFromInstance } from '../lib/utils/schema';
setup();

program
  .command('particle-agent')
  .description('Run the page query agent')
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
      const agent = new ParticleAgent({
        task: options.task,
        name: 'Test Particle Agent',
        description: '',
        maxSteps: 10,
        page: page,
        instructions: options.instructions,
        dataObjectSchema: schema,
        shouldRunPlanning: true,
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
