import express, { type Request, type Response } from "express";
const app = express();
const port = process.env.PORT || 3000;
import { prisma } from "./lib/prisma";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import { createPrismaUtils, HttpError } from "@yawpie/prisma-handler";
import { sendData, sendError } from "./utils/send";
import bcrypt from "bcrypt";

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

const validateLoginRequest = (
  req: Request,
  res: Response,
  next: () => void,
) => {
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  sendData(res, null, "topsis-spk v1.0.0 API is running");
});

const handledPrisma = createPrismaUtils(prisma);

app.post("/register", validateLoginRequest, async (req, res) => {
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
    sendData(res, newUser, "added new user");
  } catch (error) {
    console.error(error);

    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, error);
  }
});

app.post("/login", validateLoginRequest, async (req, res) => {
  // todo add password verification
  const { username } = req.body;

  try {
    const user = await handledPrisma.handleNotFound(() =>
      prisma.user.findUnique({
        where: { username },
      }),
    );

    if (!user) {
      throw new HttpError("Invalid username or password", 401);
    }
    sendData(res, user, "Login successful");
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

// ipk               Float
//   income            Float
//   dependents        Int
//   achievement_score Float
//   organization_score Float
//   semester          Int

app.post("/students", async (req, res) => {
  try {
    const {
      name,
      ipk,
      income,
      dependents,
      achievement_score,
      organization_score,
      semester,
    } = req.body;

    // if (!name || typeof name !== "string") {
    //   throw new HttpError("Name is required and must be a string", 400);
    // }
    // const newStudent = await handledPrisma.handleWrite(() =>
    //   prisma.student.create({
    //     data: {
    //       name,
    //     },
    //   }),
    // );
    // sendData(res, newStudent, "added new student");
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, error);
  }
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
