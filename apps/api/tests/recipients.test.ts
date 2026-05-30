import { describe, expect, it } from 'bun:test';
import {
  maskRecipient,
  maskValue,
  parseRecipientInput,
  railTypesMetadata,
  RAILS,
  type RailSpec,
} from '../src/lib/recipients';

function minimalValidBody(spec: RailSpec): Record<string, string> {
  const body: Record<string, string> = { type: spec.type, name: 'Test Recipient' };
  for (const f of spec.fields) {
    if (f.required) body[f.key] = f.options?.[0] ?? 'value1234';
  }
  return body;
}

describe('parseRecipientInput — every rail', () => {
  for (const spec of RAILS) {
    it(`accepts a valid ${spec.type} body`, () => {
      const r = parseRecipientInput(minimalValidBody(spec));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.type).toBe(spec.type);
    });

    it(`rejects ${spec.type} with a required field missing`, () => {
      const body = minimalValidBody(spec);
      const dropKey = spec.fields.find((f) => f.required)?.key ?? 'name';
      delete body[dropKey];
      const r = parseRecipientInput(body);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toBe('invalid_recipient');
    });

    it(`rejects ${spec.type} with an invalid enum value`, () => {
      const enumField = spec.fields.find((f) => f.options && f.options.length > 0);
      if (!enumField) return; // rail has no enum field
      const body = { ...minimalValidBody(spec), [enumField.key]: '__nope__' };
      expect(parseRecipientInput(body).success).toBe(false);
    });
  }
});

describe('parseRecipientInput — rail resolution', () => {
  it('rejects an unknown rail type', () => {
    const r = parseRecipientInput({ type: 'dogecoin', name: 'x' });
    expect(r).toEqual({ success: false, error: 'unsupported_rail' });
  });

  it('rejects a body with no type', () => {
    const r = parseRecipientInput({ name: 'x' });
    expect(r).toEqual({ success: false, error: 'unsupported_rail' });
  });

  it('passes through extra fields for BlindPay to validate', () => {
    const r = parseRecipientInput({
      type: 'pix',
      name: 'X',
      pix_key: '14947677759',
      extra_field: 'kept',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.extra_field).toBe('kept');
  });
});

describe('maskValue', () => {
  it('keeps the last four digits', () => {
    expect(maskValue('14947677759')).toBe('••••7759');
    expect(maskValue('1234567890')).toBe('••••7890');
  });
  it('fully masks short values', () => {
    expect(maskValue('12')).toBe('••••');
    expect(maskValue('1234')).toBe('••••');
  });
});

describe('maskRecipient', () => {
  it('masks the PIX key and labels the rail', () => {
    const view = maskRecipient({
      id: 'ba_Vfjbr4gMymbN',
      type: 'pix',
      name: 'Bernardo Simonassi',
      pix_key: '14947677759',
    });
    expect(view).toEqual({
      id: 'ba_Vfjbr4gMymbN',
      type: 'pix',
      name: 'Bernardo Simonassi',
      summary: 'Brazil PIX ••••7759',
    });
  });

  it('does not surface fields of a disabled rail (ach), no leak', () => {
    const view = maskRecipient({
      id: 'ba_2',
      type: 'ach',
      name: 'Acme',
      account_number: '1234567890',
    });
    // ach is not in RAILS yet → treated as unknown, account number never shown
    expect(view.summary).toBe('ach');
    expect(view.summary).not.toContain('7890');
  });

  it('handles an unknown rail without throwing', () => {
    const view = maskRecipient({ id: 'ba_3', type: 'mystery', name: null });
    expect(view.summary).toBe('mystery');
    expect(view.name).toBeNull();
  });
});

describe('railTypesMetadata', () => {
  it('prepends the common name field to every rail', () => {
    const meta = railTypesMetadata();
    expect(meta.length).toBe(RAILS.length);
    for (const rail of meta) {
      expect(rail.fields[0]?.key).toBe('name');
    }
  });
});
