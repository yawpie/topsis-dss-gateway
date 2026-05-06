import { type Response } from "express";

import { HttpError } from "@yawpie/prisma-handler";
// type number = 200 | 300 | 400 | 500;

export function sendData<T = object>(
  res: Response,
  data?: T,
  message: string = "success",
  status: number = 200,
) {
  res.status(status).json({
    message,
    ...data,
  });
}

export function sendError(
  res: Response,
  error: any,
  status: number = 500,
  message: string = "An unexpected error occurred",
) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      message: error.message,
      error,
    });
  } else {
    res.status(status).json({
      message,
      error,
    });
  }
}
