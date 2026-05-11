import type { Request,Response, NextFunction } from "express";
import {
  verifyJwt,
  verifyRefreshToken,
  generateToken,
  generateRefreshToken,
} from "../utils/jwt";

import { UnauthorizedError } from "@yawpie/prisma-handler";
import { sendError } from "../utils/send";

export default function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const accessToken = req.cookies?.access_token;
  const refreshToken = req.cookies?.refresh_token;

  try {
    // Try to verify access token first
    if (accessToken) {
      const decoded = verifyJwt(accessToken);
      if (decoded) {

        // req.admin = { adminId: decoded.adminId };
        next();
        return;
      }
    }
    
    // If access token is invalid/expired, try refresh token
    if (refreshToken) {
      const refreshDecoded = verifyRefreshToken(refreshToken);
      if (refreshDecoded) {
        // Generate new tokens
        const newAccessToken = generateToken(
          { userId: refreshDecoded.userId },
          "15m"
        );
        const newRefreshToken = generateRefreshToken({
          userId: refreshDecoded.userId,
        });

        // Set new cookies
        res.cookie("access_token", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 15 * 60 * 1000, // 15 minutes
        });
        res.cookie("refresh_token", newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // req.admin = { adminId: refreshDecoded.adminId };
        next();
        return;
      }
    }

    // Both tokens are invalid or missing
    throw new UnauthorizedError("Authentication required");
  } catch (err) {
    sendError(res, err);
  }
}
