export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type JsonSchemaObjectInstance = { [key: string]: JsonSchemaInstance };

export type JsonSchemaInstance =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | boolean[]
  | JsonSchemaInstance[]
  | { [key: string]: JsonSchemaInstance }
  | { [key: string]: JsonSchemaInstance }[];
