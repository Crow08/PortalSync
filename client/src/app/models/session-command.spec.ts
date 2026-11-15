import { parseSessionCommand } from './session-command';

describe('parseSessionCommand', () => {
  it('reads a command of the server', () => {
    const command = parseSessionCommand('{"type":"Pause","mediaStopTime":1500}');

    expect(command).toEqual({ type: 'Pause', mediaStopTime: 1500 });
  });

  it('reads every command type the server sends', () => {
    const types = ['Start', 'Resume', 'SetMedia', 'Pause', 'Stop', 'Jump', 'Leave', 'SessionDeleted', 'Nop', 'Join'];
    for (const type of types) {
      expect(parseSessionCommand(JSON.stringify({ type }))?.type).toBe(type);
    }
  });

  it('reads every kind of update', () => {
    for (const updateType of ['LoopMode', 'FairQueue', 'Queue', 'History', 'QueueAndHistory', 'UserStatus']) {
      expect(parseSessionCommand(JSON.stringify({ type: 'Update', updateType }))).toEqual({ type: 'Update', updateType });
    }
  });

  it('ignores a command it does not know, e.g. of a newer server', () => {
    expect(parseSessionCommand('{"type":"Teleport","to":3}')).toBeNull();
    expect(parseSessionCommand('{"type":"Update","updateType":"Weather"}')).toBeNull();
    expect(parseSessionCommand('{"type":"Update"}')).toBeNull();
    // the error command goes to the error queue of the sender, not to the session topic
    expect(parseSessionCommand('{"type":"Error","message":"no"}')).toBeNull();
  });

  it('ignores what is no command at all', () => {
    expect(parseSessionCommand('not json')).toBeNull();
    expect(parseSessionCommand('')).toBeNull();
    expect(parseSessionCommand('null')).toBeNull();
    expect(parseSessionCommand('42')).toBeNull();
    expect(parseSessionCommand('"Pause"')).toBeNull();
    expect(parseSessionCommand('{"mediaStopTime":1500}')).toBeNull();
    expect(parseSessionCommand('{"type":7}')).toBeNull();
  });
});
