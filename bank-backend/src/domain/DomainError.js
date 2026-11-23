// Error raised by domain objects. It knows nothing about HTTP:
// the service translates it into an AppError (status code + code).
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}