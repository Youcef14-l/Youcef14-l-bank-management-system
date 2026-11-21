import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req, _res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, "NOT_FOUND"));
}

// Must be registered LAST (after all routes). Unified error format:
// { success: false, error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal server error";
  let details;

  if (err instanceof AppError) {
    ({ statusCode: status, code, message, details } = err);
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON";
  } else if (err?.name === "PrismaClientKnownRequestError" && err.code === "P2002") {
    status = 409;
    code = "CONFLICT";
    message = "A record with the same unique value already exists";
    details = err.meta?.target;
  } else if (err?.name === "PrismaClientKnownRequestError" && err.code === "P2025") {
    status = 404;
    code = "NOT_FOUND";
    message = "Record not found";
  }

  if (status === 500) console.error(err);

  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  });
}
