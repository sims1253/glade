import { describe, expect, it } from 'vitest';

import { classifyReplLine, isProtocolFrameLine, R_READY_SIGNAL } from './r-process';

describe('r-process repl filtering', () => {
  it('suppresses the startup ready signal', () => {
    expect(classifyReplLine(R_READY_SIGNAL)).toBe('ready-signal');
  });

  it('suppresses protocol frames if they leak onto stdout', () => {
    expect(isProtocolFrameLine(JSON.stringify({
      protocol_version: '0.1.0',
      message_type: 'ProtocolEvent',
      event_id: 'evt_1',
    }))).toBe(true);
    expect(classifyReplLine(JSON.stringify({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      project_id: 'proj_1',
    }))).toBe('protocol-frame');
  });

  it('keeps ordinary console output visible', () => {
    expect(isProtocolFrameLine('{"message":"plain json from user code"}')).toBe(false);
    expect(classifyReplLine('[1] 2')).toBe('console');
  });
});
