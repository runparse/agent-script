import { codeAgentRules } from './parts';

export interface ICodeAgentRunExample {
  task: string;
  steps: {
    thought: string;
    code: string;
    result: string;
  }[];
}

export interface ICodeAgentRunExampleStep {
  thought: string;
  code: string;
  result: string;
}

export function buildExamplePrompt(example: ICodeAgentRunExample) {
  return `Task: "${example.task}"
${example.steps
  .map(
    (step, index) => `
## Step ${index + 1}:
-- Your code block start --
\`\`\`js
// Thought: ${step.thought}

${step.code}
\`\`\`
-- Your code block end --

-- UDF call result --
${step.result}`,
  )
  .join('\n')}`;
}

export function buildExamplesSectionPrompt(examples: ICodeAgentRunExample[]) {
  return `Here are a few examples using notional UDFs:

${examples
  .map(
    (example, index) => `# Example ${index + 1}

${buildExamplePrompt(example)}`,
  )
  .join('\n\n')}
`;
}

export function buildCodeAgentRulesPrompt(
  rules: readonly string[] = codeAgentRules,
) {
  return `Here are the rules you should always follow to solve your task:
${rules.map((rule, index) => `${index + 1}. ${rule}\n`).join('')}`;
}
