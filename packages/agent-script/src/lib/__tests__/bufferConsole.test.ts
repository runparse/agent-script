import { BufferConsole } from '../bufferConsole';

describe('BufferConsole', () => {
  let bufferConsole: BufferConsole;

  beforeEach(() => {
    bufferConsole = new BufferConsole();
  });

  test('should initialize with empty buffer', () => {
    expect(bufferConsole.getOutput()).toBe('');
  });

  test('should capture single log message', () => {
    bufferConsole.log('Test message');
    expect(bufferConsole.getOutput()).toBe('Test message\n');
  });

  test('should capture multiple log messages', () => {
    bufferConsole.log('Message 1');
    bufferConsole.log('Message 2');
    expect(bufferConsole.getOutput()).toBe('Message 1\nMessage 2\n');
  });

  test('should handle multiple arguments in log', () => {
    bufferConsole.log('Count:', 5, 'Status:', true);
    expect(bufferConsole.getOutput()).toBe('Count: 5 Status: true\n');
  });

  test('should strip ANSI escape codes', () => {
    const ansiMessage = '\x1b[32mGreen Text\x1b[0m';
    bufferConsole.log(ansiMessage);
    expect(bufferConsole.getOutput()).toBe('Green Text\n');
  });

  test('should handle empty log calls', () => {
    bufferConsole.log();
    expect(bufferConsole.getOutput()).toBe('\n');
  });

  test('should handle special characters', () => {
    bufferConsole.log('Special: \n\t\r');
    expect(bufferConsole.getOutput()).toBe('Special: \n\t\r\n');
  });
});
