import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleApiError(error: unknown): NextResponse {
  console.error("[API Error]", error);

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return NextResponse.json(
      {
        error: "A concurrent conflict or duplicate entry occurred.",
      },
      { status: 409 }
    );
  }

  const message = error instanceof Error ? error.message : "An unexpected server error occurred";
  return NextResponse.json(
    {
      error: message,
    },
    { status: 500 }
  );
}
