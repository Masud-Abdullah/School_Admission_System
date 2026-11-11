import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStudentId,
  validateClassInput,
  formatRemainingTime,
} from './admissionLogic';

test('validateStudentId checks 17-digit student birth registration number', () => {
  assert.equal(validateStudentId('20152691234567890').valid, true);
  assert.equal(validateStudentId('2015269123456789').valid, false);
  assert.equal(validateStudentId('201526912345678901').valid, false);
  assert.equal(validateStudentId('2015269123456789A').valid, false);
  assert.equal(validateStudentId('').valid, false);
});

test('validateClassInput checks class name and seat count', () => {
  const validMorning = validateClassInput('cLaSs 6 - mOrNiNg sHiFt', 120);
  assert.equal(validMorning.valid, true);
  assert.equal(validMorning.normalizedName, 'Class 6 - Morning Shift');

  const validDay = validateClassInput('CLASS 12 - DAY SHIFT', 80);
  assert.equal(validDay.valid, true);
  assert.equal(validDay.normalizedName, 'Class 12 - Day Shift');

  assert.equal(validateClassInput('', 120).valid, false);
  assert.equal(validateClassInput('hello everyone!', 120).valid, false);
  assert.equal(validateClassInput('class -4 - Morning Shift', 120).valid, false);
  assert.equal(validateClassInput('Class 15 - Morning Shift', 120).valid, false);
  assert.equal(validateClassInput('Class 6 - Morning Shift', 0).valid, false);
  assert.equal(validateClassInput('Class 6 - Morning Shift', -5).valid, false);
  assert.equal(validateClassInput('Class 6 - Morning Shift', 12.5).valid, false);
});

test('formatRemainingTime formats countdown and detects expiration', () => {
  const now = new Date('2026-11-01T04:00:00Z').getTime();
  const res1 = formatRemainingTime('2026-11-01T04:09:05Z', now);
  assert.equal(res1.isExpired, false);
  assert.equal(res1.formatted, '09:05');

  const res2 = formatRemainingTime('2026-11-01T03:59:59Z', now);
  assert.equal(res2.isExpired, true);
  assert.equal(res2.formatted, '00:00');
});
