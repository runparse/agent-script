import { Type } from '@sinclair/typebox';
import { schemaToTypeString } from '../utils';

describe('schemaToTypeString', () => {
  it('should handle primitive types', () => {
    expect(schemaToTypeString(Type.String())).toBe('string;');
    expect(schemaToTypeString(Type.Number())).toBe('number;');
    expect(schemaToTypeString(Type.Integer())).toBe('number;');
    expect(schemaToTypeString(Type.Boolean())).toBe('boolean;');
    expect(schemaToTypeString(Type.Null())).toBe('null;');
  });

  it('should handle literal types', () => {
    expect(schemaToTypeString(Type.Literal('hello'))).toBe('"hello"');
    expect(schemaToTypeString(Type.Literal(42))).toBe('42');
    expect(schemaToTypeString(Type.Literal(true))).toBe('true');
  });

  it('should handle object types', () => {
    const schema = Type.Object({
      name: Type.String(),
      age: Type.Number(),
      isActive: Type.Boolean(),
    });
    const expected = `{
  name: string;
  age: number;
  isActive: boolean;
}`;
    expect(schemaToTypeString(schema)).toBe(expected);
  });

  it('should handle optional properties in objects', () => {
    const schema = Type.Object({
      required: Type.String(),
      optional: Type.Optional(Type.Number()),
    });
    const expected = `{
  required: string;
  optional?: number;
}`;
    expect(schemaToTypeString(schema)).toBe(expected);
  });

  it('should handle array types', () => {
    expect(schemaToTypeString(Type.Array(Type.String()))).toBe(
      'Array<string;>',
    );
    expect(schemaToTypeString(Type.Array(Type.Number()))).toBe(
      'Array<number;>',
    );
  });

  it('should handle nested objects and arrays', () => {
    const schema = Type.Object({
      users: Type.Array(
        Type.Object({
          name: Type.String(),
          age: Type.Number(),
        }),
      ),
    });
    const expected = `{
  users: Array<{
  name: string;
  age: number;
}>
}`;
    expect(schemaToTypeString(schema)).toBe(expected);
  });

  it('should handle enum types', () => {
    const schema = Type.Enum({
      Red: 'red',
      Green: 'green',
      Blue: 'blue',
    });
    expect(schemaToTypeString(schema)).toBe('// red | green | blue;');
  });

  it('should handle union types', () => {
    const schema = Type.Union([Type.Literal('success'), Type.Literal('error')]);
    expect(schemaToTypeString(schema)).toBe('// success | error;');
  });

  it('should handle any and unknown types', () => {
    expect(schemaToTypeString(Type.Any())).toBe('any;');
    // Unknown type is handled in the default case
    expect(schemaToTypeString({ type: 'custom' } as any)).toBe('unknown;');
  });

  it('should include description comments when present', () => {
    const schema = Type.String({ description: 'User name' });
    expect(schemaToTypeString(schema)).toBe('string; // User name');
  });
});
