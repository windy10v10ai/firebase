import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// GET 带不了请求体，代发路由把 JSON 用 base64url 放进 query；解码后走与原路由相同的
// DTO 校验，任何一步失败都按 400 处理
export async function decodeProxyBody<T extends object>(
  dtoClass: ClassConstructor<T>,
  encoded: string,
): Promise<T> {
  if (!encoded) {
    throw new BadRequestException();
  }
  let plain: unknown;
  try {
    plain = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException();
  }
  if (typeof plain !== 'object' || plain === null || Array.isArray(plain)) {
    throw new BadRequestException();
  }
  const dto = plainToInstance(dtoClass, plain);
  const errors = await validate(dto, { forbidUnknownValues: false });
  if (errors.length > 0) {
    throw new BadRequestException();
  }
  return dto;
}
