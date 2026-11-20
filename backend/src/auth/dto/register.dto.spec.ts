import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto.js';

const valid = {
  fullName: 'Mona Ahmed',
  emailAddress: 'mona@example.com',
  username: 'mona.ahmed',
  password: 'Travel2026',
  acceptedTerms: true,
  countryOfOriginId: '665f1c2a9b1e4a0012345678',
};

/** Same steps as the global ValidationPipe: transform, then validate. */
const check = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(RegisterDto, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, failedFields: errors.map((e) => e.property) };
};

describe('RegisterDto (ACC-01)', () => {
  it('accepts a valid body', async () => {
    expect((await check(valid)).failedFields).toEqual([]);
  });

  it('rejects a name made only of spaces (400, not a database error)', async () => {
    expect((await check({ ...valid, fullName: '   ' })).failedFields).toEqual(['fullName']);
  });

  it('trims surrounding spaces from text fields', async () => {
    const { dto, failedFields } = await check({ ...valid, fullName: '  Mona  ', emailAddress: ' mona@example.com ' });
    expect(failedFields).toEqual([]);
    expect(dto.fullName).toBe('Mona');
    expect(dto.emailAddress).toBe('mona@example.com');
  });

  it('does not trim the password', async () => {
    const { dto } = await check({ ...valid, password: ' Travel2026 ' });
    expect(dto.password).toBe(' Travel2026 ');
  });

  it.each([
    ['password without a digit', { password: 'abcdefgh' }, 'password'],
    ['password without a letter', { password: '12345678' }, 'password'],
    ['consent not given', { acceptedTerms: false }, 'acceptedTerms'],
    ['invalid email', { emailAddress: 'not-an-email' }, 'emailAddress'],
    ['phone not in E.164', { phoneNumber: '01234567890' }, 'phoneNumber'],
  ])('rejects %s', async (_case, change, field) => {
    expect((await check({ ...valid, ...change })).failedFields).toEqual([field]);
  });

  it('rejects unknown fields such as role (no self-registered admins, ACC-18)', async () => {
    expect((await check({ ...valid, role: 'admin' })).failedFields).toEqual(['role']);
  });
});
