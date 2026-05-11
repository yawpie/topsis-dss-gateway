import express, { type Request, type Response } from "express";
const app = express();
const port = process.env.PORT || 3000;
import { prisma } from "./lib/prisma";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createPrismaUtils, HttpError } from "@yawpie/prisma-handler";
import { sendData, sendError } from "./utils/send";
import bcrypt from "bcrypt";
import router from "./topsis";
import criterionRouter from "./criterion";
import { generateRefreshToken, generateToken } from "./utils/jwt";

const allowedOrigin =
  process.env.ALLOWED_ORIGIN?.split(",").map((origin) => origin.trim()) || [];
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Prevents blocking images from this API to other domains if applicable
  }),
);
app.use(
  cors({
    origin: (origin: any, callback: any) => {
      if (!origin) return callback(null, true); // allow non-browser tools like Postman

      // Match string or RegExp patterns
      const isAllowed = allowedOrigin.some((o) => o === origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const validateAuthRequest = (req: Request, res: Response, next: () => void) => {
  const { username, password } = req.body;
  if (!username || typeof username !== "string") {
    sendError(
      res,
      new HttpError("Username is required and must be a string", 400),
    );
    return;
  }
  if (!username || !password) {
    sendError(res, new HttpError("Username and password are required", 400));
    return;
  } else {
    next();
  }
};

app.get("/", (req, res) => {
  sendData(res, null, "topsis-spk v1.0.0 API is running");
});

const handledPrisma = createPrismaUtils(prisma);

app.post("/register", validateAuthRequest, async (req, res) => {
  // Handle POST request to /register
  try {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await handledPrisma.handleWrite(() =>
      prisma.user.create({
        data: {
          username,
          password: hashedPassword,
        },
      }),
    );
    sendData(res, undefined, "added new user");
  } catch (error) {
    console.error(error);

    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, error);
  }
});

app.post("/login", validateAuthRequest, async (req, res) => {
  const { username, password } = req.body;
  // const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await handledPrisma.handleNotFound(() =>
      prisma.user.findUnique({
        where: { username },
      }),
    );
    if (!user) {
      throw new HttpError("Invalid username or password", 401);
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new HttpError("Invalid password", 401);
    }

    const refreshToken = generateRefreshToken({ userId: user.id });
    const accessToken = generateToken({ userId: user.id }, "15m");

    res
      .status(200)
      .cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
      })
      .json({ message: "Login successful", access_token: accessToken });
    // sendData(res, user, "Login successful");
  } catch (error) {
    console.error(error);
    sendError(
      res,
      error instanceof HttpError
        ? error
        : new HttpError("An unexpected error occurred", 500),
      error instanceof HttpError ? error.status : 500,
      error instanceof HttpError
        ? error.message
        : "An unexpected error occurred",
    );
  }
});
app.use("/", router);
app.use("/", criterionRouter);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
