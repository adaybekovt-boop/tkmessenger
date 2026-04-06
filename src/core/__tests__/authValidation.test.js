import { describe, expect, it } from 'vitest';
import { passwordStrength, validatePassword, validatePasswordConfirm, validateUsername } from '../authValidation.js';

describe('authValidation', () => {
  it('validates username rules', () => {
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('a'.repeat(31)).ok).toBe(false);
    expect(validateUsername('Tamer').ok).toBe(false);
    expect(validateUsername('tamer_01').ok).toBe(true);
  });

  it('validates password rules', () => {
    expect(validatePassword('1234567').ok).toBe(false);
    expect(validatePassword('12345678').ok).toBe(true);
    expect(validatePasswordConfirm('a', 'b').ok).toBe(false);
    expect(validatePasswordConfirm('a', 'a').ok).toBe(true);
  });

  it('computes strength', () => {
    expect(passwordStrength('12345678')).toBeGreaterThanOrEqual(1);
    expect(passwordStrength('Abcdef12!')).toBeGreaterThanOrEqual(3);
  });
});

