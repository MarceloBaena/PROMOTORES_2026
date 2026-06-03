import { BadRequestException, ValidationError } from '@nestjs/common';

const collectValidationMessages = (
  errors: ValidationError[],
  parentPath?: string,
): string[] =>
  errors.flatMap((error) => {
    const propertyPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownMessages = error.constraints
      ? Object.values(error.constraints).map(
          (message) => `${propertyPath}: ${message}`,
        )
      : [];
    const nestedMessages = error.children?.length
      ? collectValidationMessages(error.children, propertyPath)
      : [];

    return [...ownMessages, ...nestedMessages];
  });

export const createValidationException = (errors: ValidationError[]) => {
  const messages = collectValidationMessages(errors);

  return new BadRequestException({
    error: 'ValidationError',
    message: messages[0] ?? 'Requisicao invalida.',
    details: {
      validation: messages,
      count: messages.length,
    },
  });
};
