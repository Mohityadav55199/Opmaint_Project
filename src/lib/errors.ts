import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "API_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad Request", details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required", details?: unknown) {
    super(401, message, "UNAUTHORIZED", details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to perform this action", details?: unknown) {
    super(403, message, "FORBIDDEN", details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Requested resource not found", details?: unknown) {
    super(404, message, "NOT_FOUND", details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "A state or concurrent conflict occurred", details?: unknown) {
    super(409, message, "CONFLICT", details);
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(message = "Unprocessable entity / safety validation failed", details?: unknown) {
    super(422, message, "UNPROCESSABLE_ENTITY", details);
  }
}

/**
 * Global API error handler ensuring stable error shapes without leaking raw database/Prisma internals.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // 1. Domain / Application ApiErrors
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  // 2. Zod Schema Validation Errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload format or missing required fields.",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 }
    );
  }

  // 3. Prisma Known Request Errors
  if (error && typeof error === "object" && "code" in error) {
    const prismaCode = (error as { code: string }).code;

    // P2002: Unique constraint violation
    if (prismaCode === "P2002") {
      console.warn("[Prisma P2002 Conflict]", error);
      return NextResponse.json(
        {
          code: "CONFLICT",
          message: "A concurrent conflict or duplicate entry occurred.",
        },
        { status: 409 }
      );
    }

    // P2025: Record not found
    if (prismaCode === "P2025") {
      return NextResponse.json(
        {
          code: "NOT_FOUND",
          message: "The requested record was not found.",
        },
        { status: 404 }
      );
    }

    // P2003: Foreign key constraint failure
    if (prismaCode === "P2003") {
      console.error("[Prisma Foreign Key Error]", error);
      return NextResponse.json(
        {
          code: "FOREIGN_KEY_VIOLATION",
          message: "Referenced record does not exist or relation is restricted.",
        },
        { status: 400 }
      );
    }
  }

  // 4. Unexpected server errors (Never expose raw Prisma / SQL / stack traces to client)
  console.error("[Unhandled Server Error]", error);

  return NextResponse.json(
    {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred. Please contact the system administrator.",
    },
    { status: 500 }
  );
}
