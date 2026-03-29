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

export class UnauthorizedError extends AppError {
  constructor(message = '请先登录') {
    super(message, 'unauthorized', 401);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = '服务暂时不可用，请稍后重试') {
    super(message, 'service_unavailable', 503);
  }
}
