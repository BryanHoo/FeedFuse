export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields: Record<string, string>) {
    super(message, 'validation_error', 400, fields);
  }
}

export class NotFoundError extends AppError {
  constructor(message = '未找到对应内容') {
    super(message, 'not_found', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = '当前操作暂时无法完成，请稍后重试', fields?: Record<string, string>) {
    super(message, 'conflict', 409, fields);
  }
}
