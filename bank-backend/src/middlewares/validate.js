import { AppError } from "../utils/AppError.js";

// validate(schema)            -> validates req.body   (and replaces it with the cleaned data)
// validate(schema, "params")  -> validates req.params (result in req.validated.params)
// validate(schema, "query")   -> validates req.query  (result in req.validated.query)
export const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return next(new AppError("Validation failed", 400, "VALIDATION_ERROR", details));
    }

    if (source === "body") {
      req.body = result.data;
    } else {
      req.validated = { ...(req.validated ?? {}), [source]: result.data };
    }
    next();
  };
