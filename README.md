# AgentScript

AgentScript is a simple, observable code agent builder written in TypeScript, inspired by [smolagents](https://github.com/huggingface/smolagents). We built AgentScript to enable more production-grade agentic use cases, and share some smol examples (math agent, web-answers, web-navigation, deep research). Let’s build something awesome! 😊

## Demo

[1 video]

## What Is It

AgentScript provides an agent loop scaffold that breaks down a task into multiple steps. In each step, the agent uses its memory on previous steps, and

1. Generates descriptive / reasoning comments, followed by a javascript / typescript script block.
2. Executes the generated script in a Node vm, using built-ins and a list of User-Defined Functions (UDFs).
3. Adds all UDF call output (or any errors in script execution) into the agent memory context as observations.

The Agent will keep taking steps towards the goal of the task and terminate when any of the conditions are met:

1. A UDF provides the final answer for the task.
2. The agent reaches the maximum steps allowed.
3. The agent is stuck in an error loop.

### Main Features

- A simple, customizable agent loop that enables scalable agentic workflow execution.
- No-code OpenTelemetry instrumentation. Full task / step tracing & token usage statistics.
- UDFs for web browser actions (visual) + web automation agent sample.

## Quick Start

Find ready-to-run samples in the `examples` folder

## Why Code Agents?

Take it from huggingface: [Writing actions as code snippets is demonstrated to work better than the current industry practice of letting the LLM output a dictionary of the tools it wants to call: uses 30% fewer steps (thus 30% fewer LLM calls) and reaches higher performance on difficult benchmarks.](https://github.com/huggingface/smolagents?tab=readme-ov-file#how-do-code-agents-work)

At a fundamental level, LLMs are remarkable at writing code, and this makes sense because code is a highly structured way of converting fuzzy ideas to exact actions through language.

In addition, there have been decades of work creating compilers, interpreters, and sandboxes for programming languages that provide highly optimized access to the core components of a computer (working memory, variables, long term storage, object oriented design, object passing, and so much more). We believe these components are likely to be the functional components of AGI.

So we’re betting on code-writing agents as being the best agents in terms of quality and performance. For our own projects, to go past smol agents towards production, we needed a simple, yet powerful Typescript agent builder. That’s what AgentScript is.
