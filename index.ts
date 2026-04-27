import express, { type Request, type Response } from "express";
const app = express();
const port = process.env.PORT || 3000;
import { prisma } from "./lib/prisma";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import {
  createPrismaUtils,
  NotFoundError,
  HttpError,
} from "@yawpie/prisma-handler";

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
  const data = req.body;
  if (
    !data.username
    // ||     !data.password
  ) {
    return res.status(400).json({ error: "Username are required" });
  } else {
    next();
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("yeyyy nyala");
});

const handledPrisma = createPrismaUtils(prisma);

app.post("/register", validateLoginRequest, async (req, res) => {
  // Handle POST request to /register
  // const hashedPassword = await bcrypt.hash(password, 10);
  // if (!username || typeof username  !== "string") {
  //   return res.status(400).json({ error: "Username is required" });
  // }
  try {
    const { username } = req.body;
    const newUser = await handledPrisma.handleWrite(() =>
      prisma.users.create({
        data: {
          username,
          email: "email",
          name: "name",
        },
      }),
    );
    res.json({ message: "User registered successfully", user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", validateLoginRequest, async (req, res) => {
  // Handle POST request to /login
  const { username } = req.body;

  try {
    const user = await handledPrisma.handleNotFound(() =>
      prisma.users.findUnique({
        where: { username },
      }),
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    res.json({ message: "Login successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/post", async (req, res) => {
  // Handle POST request to /post
  try {
    const { title, content } = req.body;
    const newPost = {
      title,
      content,
    };
    const createdPost = await handledPrisma.handleWrite(() =>
      prisma.posts.create({ data: newPost }),
    );

    res.json(createdPost);
  } catch (error) {
    if (error instanceof HttpError) {
      res.json(`an error happened: ${error.message}`);
      return;
    }
    res.json(``);
  }
  // Here you would typically save the new post to a database
});

app.get("/post", async (req, res) => {
  // Handle GET request to /post
  try {
    const posts = await handledPrisma.handleNotFound(() =>
      prisma.posts.findMany(),
    );

    res.json(posts);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.json(`failed to get data: ${error.message}`);
      return;
    }
    res.json("failed to get data");
  }
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
